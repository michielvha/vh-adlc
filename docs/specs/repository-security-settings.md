---
status: draft
status_description: "R-34 findings folded with the recommended options per the owner's standing instruction; a new spec review is due. Implementation waits for vhco-pro/docs#30 to merge."
issue: null
goal: "Every full authorized maintenance sweep and onboarding by a consumer that opts in turns on, in each github.com repository its committed settings name and except what its keep-off list names, Dependabot alerts wherever the plan offers them, secret scanning and push protection on public repositories, and Dependabot security updates where Dependabot is the updater, without duplicating Renovate's pull requests; every sweep reports each setting's state and what it changed."
covers:
  - AGENTS.md
  - plugins/vh-adlc/knowledge.md
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - plugins/vh-adlc/scripts/security-settings/
  - plugins/vh-adlc/scripts/maintenance/collect.ts
  - plugins/vh-adlc/scripts/maintenance/settings.ts
  - plugins/vh-adlc/scripts/maintenance/types.ts
  - plugins/vh-adlc/scripts/maintenance/report.ts
  - plugins/vh-adlc/scripts/maintenance/cli.ts
  - plugins/vh-adlc/scripts/maintenance/authority.ts
  - plugins/vh-adlc/scripts/maintenance/security-io.ts
  - plugins/vh-adlc/scripts/maintenance/security.ts
  - plugins/vh-adlc/scripts/maintenance/journal.ts
  - plugins/vh-adlc/references/security-settings.md
  - plugins/vh-adlc/references/maintenance.md
  - plugins/vh-adlc/references/maintenance-settings.md
  - plugins/vh-adlc/references/authority.md
  - plugins/vh-adlc/references/loop.md
  - plugins/vh-adlc/references/lifecycle.md
  - plugins/vh-adlc/skills/vh-adlc-maintenance/SKILL.md
  - docs/user-guides/workflows.md
  - docs/reference/compatibility.md
  - tests/vh-adlc/security-settings/
  - tests/vh-adlc/maintenance/
---

# Plan: Repository security settings

Maintenance sweeps and onboarding turn on the free GitHub security settings that
`conventions/repository-security.md` asks for and the helper manages, where the consumer opts in,
and report them everywhere. Dependabot security updates stay off where
Renovate opens the fix pull requests.

## Context

### Owner summary

A bg-remove sweep found Dependabot alerts off. Once enabled, GitHub listed 47
alerts and Renovate opened two security pull requests.

A new helper automates that step. Sweeps run it before collecting alerts, and so does onboarding.
When the sweeping repository's committed `.vh-adlc/maintenance.yaml` opts in with
`security_settings: apply`, it turns these on when off in every covered repository those committed
settings name (the origin always counts), except what the keep-off list names. Only a full authorized sweep, or onboarding, may write; onboarding
usually checks, since its commit links the settings. Restricted or pull-request-scoped runs, and other GitHub hosts (`not-github-com`), check:

- Dependabot alerts, with the dependency graph, in every repository, private ones too.
- On public repositories, secret scanning and push protection.
- Dependabot security updates only where the repository has a `dependabot.yml` and no sign of
  Renovate: a config file, a pull request or a Dependency Dashboard issue from `app/renovate`. With
  no signal either way it leaves them off, so the bots never open competing pull requests.

The sweep report gets a section with each setting's state and reason. Its owner decisions list
names Dependabot security updates left on beside Renovate or paused, and keep-off settings found on. On a
private repository whose paid features read as off, it lists code scanning as unavailable for the
plan, not as a coverage gap.

The helper never turns a setting off. It skips public-only settings on private repositories,
writes nothing to archived ones, and reports what it cannot read as `unknown`. A keep-off list
stops it from enabling chosen settings. A failure in one repository never stops the sweep, and
alerts enabled during a sweep count as incomplete until the next one.

The rules follow vhco-pro/docs#30. CodeQL comes from its reusable workflows,
so the helper never turns on CodeQL default setup. Implementation waits for docs#30 to merge,
then moves both docs pins with a minor version bump.

This widens the authority table; today vh-adlc changes only merged-branch deletion.

Proof is planned, not observed: Bun tests against a fake `gh`, and a live sweep of bg-remove.
Reviews R-1 to R-34 found nothing blocking; later findings were folded with each
recommendation, as the owner instructed. Acceptance
authorizes tasks, implementation on a feature branch, the pin move, the version bump and that live
sweep. A release, adopting `apply` in bg-remove, and changes to other repositories outside a sweep
or onboarding need separate approval.

### Background

The maintenance collector reads open Dependabot and code scanning alerts per repository
(`plugins/vh-adlc/scripts/maintenance/collect.ts:108-115`, `:240-241`). An unmatched 403 or 404
leaves that surface incomplete (`plugins/vh-adlc/references/maintenance.md:80`). Nothing in the
plugin changes a security setting. The only repository setting it writes is merged-branch deletion,
through `autoDelete` (`plugins/vh-adlc/scripts/branches/branches.ts:273-284`), and only with the
owner's authorization: a yes, a request that asks for it, or an approved plan digest
(`plugins/vh-adlc/references/authority.md:32`, `plugins/vh-adlc/references/loop.md:70-73`,
`plugins/vh-adlc/references/lifecycle.md:64`, `plugins/vh-adlc/skills/vh-adlc-maintenance/SKILL.md:37-38`).
The user guide says vh-adlc "checks it when it onboards a repository and in every maintenance sweep,
and offers to turn it on", and describes no other repository setting
(`docs/user-guides/workflows.md:143-145`).

Observed on `michielvha/bg-remove` during maintenance run `7ece4509` on 2026-11-10:

- The Dependabot alerts endpoint returned 403 with alerts disabled, and code scanning returned 404
  with no analysis. Both surfaces were recorded as incomplete.
- `gh api -X PUT repos/michielvha/bg-remove/vulnerability-alerts` returned `HTTP/2.0 204 No Content`.
- `gh api repos/michielvha/bg-remove --jq .security_and_analysis` then showed
  `dependabot_security_updates` disabled, and `secret_scanning` and `secret_scanning_push_protection`
  enabled, on this public repository.
- `gh api 'repos/michielvha/bg-remove/dependabot/alerts?state=open'` listed 47 alerts about 20
  seconds later.
- `gh pr list -R michielvha/bg-remove --author app/renovate --state all` showed PR #24 (`vite` to
  8.1.6 `[security]`) and PR #25 (`vitest` to 4.1.11 `[security]`), opened at 07:14 and 07:15 UTC
  after the alerts were enabled.
- The repository has no Renovate config file, yet Renovate opens its pull requests, so a rule that
  looks only for a config file would miss it.
- `gh api -i repos/michielvha/bg-remove/automated-security-fixes` returned `HTTP/2.0 200 OK` with
  `{"enabled":false,"paused":false}` while security updates were off.

On the private repository `michielvha/vitepress`, `gh api repos/michielvha/vitepress` returned
`visibility` private, `permissions.admin` true and `security_and_analysis` null on 2026-11-10.

vhco-pro/docs#30 (open, head `4b2198d`) proposes `conventions/repository-security.md`. Its feature
list by visibility and its updater rule are the ones this design applies; see Sources. It is not yet
in the docs revision this repository pins (`a4e3d592`), so this document cites the PR.

Plan availability, from GitHub's documentation (see Sources): the dependency graph and Dependabot
alerts are included in all plans. Dependabot security updates need only those two. Code scanning and
secret scanning are on for public repositories by default. Private and internal repositories need
GitHub Code Security or GitHub Secret Protection, which require a Team or Enterprise plan. Renovate
reads GitHub's vulnerability alerts only when the dependency graph and Dependabot alerts are
enabled. With security updates on, Dependabot tries to open a pull request for every open alert that
has a patch.

Owner decisions on 2026-11-10:

- Sweeps apply the settings instead of only reporting them.
- Dependabot alerts are enabled in every repository whose plan offers them.
- Dependabot security updates are enabled only when Renovate is absent.
- Plan and visibility limits are respected, and paid features are never attempted on private
  repositories.
- Q1, answered A: public repositories also get secret scanning, push protection and CodeQL. After
  vhco-pro/docs#30 was opened, the owner asked for the design to follow it, so CodeQL comes from that
  convention's reusable workflow and the helper does not turn on CodeQL default setup.
- Q2, answered A: Renovate is present when the default branch has a Renovate config file or
  `app/renovate` has authored any pull request in the repository.
- Q3, answered A: onboarding applies the settings as well as sweeps.
- Q2, extended by Q6 answered A: an open issue authored by `app/renovate` whose title contains
  "Dependency Dashboard" also shows Renovate. Security updates are turned on only with a positive
  Dependabot signal, a `.github/dependabot.yml` or `.github/dependabot.yaml`, and no Renovate signal.
- Q4 to Q11, from spec review R-1, answered on 2026-11-10 with every recommended option: unreadable
  settings are `unknown` (Q4), security updates wait for alerts (Q5), the Renovate rule above (Q6), a
  `renovate-overlap` reason (Q7), private code scanning reported as unavailable for the plan (Q8),
  implementation waits for docs#30 (Q9), a per-repository keep-off list (Q10), and the stated live
  proof limit (Q11).
- Q12 to Q18, from spec review R-2, answered on 2026-11-10 with every recommended option: both docs
  pins move with a plugin minor version bump (Q12); docs#30 now states the positive-signal rule
  (Q13); a keep-off setting found on is `already-on` with `owner-choice-conflict` (Q14); a second run
  promises no change only after a clean first run (Q15); a failed read is `unknown` with `api-error`
  (Q16); one precedence order picks each reason (Q17); and the helper's Markdown has an owner
  decisions list (Q18).
- Q19, raised by a pending review at `422e79a` that was not stored, answered on 2026-11-10 with the recommended option: a
  private or internal repository's code scanning counts as unavailable for the plan only when an
  admin read of `security_and_analysis` shows neither `advanced_security` nor `code_security`
  enabled. Without that evidence the surface stays incomplete.
- Q20 to Q22, raised by a pending review at `869b5fe` that was not stored, answered on 2026-11-10
  with every recommended option: a failed detection lookup leaves security updates off with
  `renovate-detection-failed` or `dependabot-detection-failed` (Q20); the sweep report renders the
  helper's output in its own section through a new report input (Q21); and the owner's acceptance
  of this feature is the standing agreement the onboarding guide asks for, with docs#30 naming both
  Dependabot config file names since `106ecfb` (Q22).
- Q23 to Q27, from spec review R-3, answered on 2026-11-10 with every recommended option: a
  Dependabot surface whose alerts were enabled in the same run is incomplete with
  `alerts-enabled-this-run` (Q23); a helper failure is reported and never stops the sweep (Q24);
  settings are written only in consumers that adopt `security_settings: apply` in their committed
  settings, and every other consumer gets `check` (Q25, which narrows Q3 and the sweep default,
  and makes that adoption, in place of acceptance of this feature, the agreement Q22 names);
  `read_only`, `draft_only`, `no_push` and `no_filesystem` select `check` (Q26); and a criterion
  proves sweeps do not request the new page (Q27).
- Q28 to Q30, from spec review R-4, answered on 2026-11-10 with every recommended option: tests
  prove the opt-in is read only from committed, linked settings, and the committed-settings key list
  accepts both new keys so a standing publication grant survives; the missing `security_policy` key
  stays a separate issue (Q28); rule 6 decides only the rows that do not write (Q29); and the
  helper-failure rule is proved by the skill text, with the Bun test claiming only collector
  behaviour (Q30).
- Q31 and Q32, from spec review R-5, answered on 2026-11-10 with every recommended option: both new
  settings keys carry the older-reader note `security_policy` has, naming the minimum plugin version
  (Q31); and a keep-off row for Dependabot alerts also leaves security updates `left-off` with
  `owner-choice` (Q32).
- Q33 to Q36, from spec review R-6, answered on 2026-11-10 with every recommended option: an entry
  with a detection-failed reason makes the helper exit 1, while one already on stays `already-on`
  with exit 0 (Q33, as Q39 words it); a keep-off row for secret scanning also leaves push
  protection `left-off` (Q34); `collect` and `report` accept only valid helper files bound to the
  current run and show any other as "helper did not run" (Q35); and paused security updates are
  `already-on` with reason `paused`, listed for the owner (Q36).
- Q37 and Q38, from spec review R-7, answered on 2026-11-10 with every recommended option: an entry
  has one reason, with `owner-choice-conflict` before `paused` before `renovate-overlap` (Q37); and
  a restricted onboarding request selects `check` as a sweep does (Q38).
- Q39 and Q40, from spec review R-8, answered on 2026-11-10 with every recommended option: the Q33
  bullet is reworded, not the design (Q39); and the report test covers all three owner-decision
  reasons (Q40). The owner also said, on 2026-11-10, to take the recommended option for every later
  review question without asking again.
- Q41 to Q43, from spec review R-9, taken with the reviewer's proposal under that instruction: only
  a full sweep whose request has `authorized_sweep` true may apply, a PR-scoped assessment checks,
  and a continuation reuses the run's files (Q41); a write that succeeds but does not take effect
  is `not-changed` with "not on after write" (Q42); and the skill records a coverage handoff naming
  the next sweep for an `alerts-enabled-this-run` surface (Q43).
- Q44 to Q47, from spec review R-10, taken with the reviewer's proposal under that instruction:
  under `apply`, keep-off rows and the writable repository list come from committed settings
  (Q44); the authorized-sweep, pull-request-scope, continuation and handoff rules are stated in
  the skill and references (Q45); rule 2 does not decide an entry read as on, so a kept-off paid
  setting found on gives `owner-choice-conflict` as Q14 says (Q46); and the summary names these
  limits (Q47).
- Q48 and Q49, from spec review R-11, taken with the reviewer's proposal under that instruction:
  `security-settings-mode` and the helper's `apply` take the repository and the committed
  default-branch binding, the origin repository always counts as named, and a repository outside
  the committed scope is `check` with `not-in-committed-scope` (Q48); and onboarding under `check`
  reports, says how to opt in, records the guide's checklist item as pending and never applies on an
  in-session yes (Q49).
- Q50 and Q51, from spec review R-12, taken with the reviewer's proposal under that instruction:
  `collect` takes the repositories run in `apply` and records a Dependabot surface without an
  accepted helper file as incomplete with `helper-receipt-missing` (Q50); and the opt-in needs only
  the committed settings link, not `project_procedure` (Q51).
- Q52 to Q54, from spec review R-13, taken with the reviewer's proposal under that instruction:
  an attempted alerts write that is `not-changed` with `api-error` also makes the surface
  incomplete (Q52); the mode read validates against the `settings.ts` key list, and a binding or
  validation failure exits nonzero and leads to `check` (Q53); and the coverage handoff sets
  `assignment_handoff` to the next sweep (Q54).
- Q55, from spec review R-14, taken with the reviewer's proposal under that instruction: the
  helper's `apply` itself refuses every write when the bound committed settings do not adopt it or
  do not name the target, so the opt-in does not rest on the skill alone.
- Q56 and Q57, from spec review R-15, taken under that instruction: the helper's refusal reasons
  are mode reasons only, so entries match the mode path (Q56); and the two repeatable flags are a
  named exception to the duplicate-flag rule (Q57).
- Q58 to Q61, from spec review R-16, taken with the reviewer's proposal under that instruction: an
  AC-11 clause naming no page is required only in `references/security-settings.md` (Q58); every
  sweep report renders the section (Q59); `apply` with `--run-id` also refuses under the run's
  request and scope (Q60); and `check` reads keep-off rows from the committed settings when given a
  binding (Q61).
- Q62 to Q64, from spec review R-17, taken with the reviewer's proposal under that instruction:
  `check` falls back to the working tree's keep-off rows when its binding fails (Q62); the mode
  reasons are named and ordered (Q63); and a sweep report names the opt-in under `check` (Q64).
- Q65, from spec review R-18, taken with the reviewer's proposal under that instruction: every
  nonzero exit of `security-settings-mode` leads to `check` with `committed-settings-unresolved`,
  and a report with no helper file names the opt-in.
- Q66 and Q67, from spec review R-19, taken with the reviewer's proposal under that instruction:
  the report's opt-in line depends only on accepted files (Q66); and the helper's own reason takes
  precedence over `--mode-reason`, which `apply` no longer takes (Q67).
- Q68, from spec review R-20, taken with the reviewer's proposal under that instruction: the
  helper's refusal reason follows the ordered mode reasons, and the goal names the full authorized
  sweep, committed scope and keep-off limits.
- Q69, from spec review R-21, taken with the reviewer's proposal under that instruction: AC-11
  names the user guide section, and the AC-24 fixtures assert each printed mode reason.
- Q70, from spec review R-22, taken under that instruction: the full coverage handoff shape is
  stated, and fixtures cover `dependabot.yaml`, internal repositories and `advanced_security`.
- Q71, from spec review R-23, taken with the reviewer's proposal under that instruction: with a
  run, a target outside its recorded scope is `check` with `not-in-run-scope` in both the mode
  command and the helper's `apply`; AC-11 states the full handoff.
- Q72, from spec review R-24, taken with the reviewer's proposal under that instruction: `apply`
  with an unreadable `--run-id` makes no write and fails visibly, and the mode fixtures assert
  `not-adopted` and `not-in-run-scope`.
- Q73, from spec review R-25, taken with the reviewer's proposal under that instruction: AC-11
  names `references/maintenance.md` for the helper exception and report section and the skill for
  passing files; AC-24 states `apply`'s failure cases.
- Q74, from spec review R-26, taken with the reviewer's proposals under that instruction: `apply`
  with invalid committed settings makes no write and exits nonzero, with a tenth fixture; the
  authorized-sweep clause is scoped to maintenance runs so onboarding may apply as the committed
  settings decide; `helper-receipt-missing` is a documented collector rule on both pages.
- Q75, from spec review R-27, taken with the recommended option under that instruction: when the
  committed settings are unlinked or absent, `check` reads keep-off rows from the working tree, as
  on a binding failure, with an AC-17 fixture; the authority row scopes its `check` triggers to
  maintenance runs; an eleventh `apply` fixture uses a broken run chain.
- Q76, from spec review R-28, taken with the reviewer's proposal under that instruction: the AC-17
  fallback fixtures keep the row only in the working tree and cover each unlinked or absent path.
- Q77, from spec review R-29, taken with the reviewer's proposal under that instruction: the
  helper's `apply` never reads adoption from the working tree, with two `apply` fixtures for
  unlinked and absent committed settings beside a working tree that adopts `apply`.
- Q78, from spec review R-30, taken with the reviewer's proposal under that instruction: two more
  helper `apply` fixtures, for a linked settings file never committed and for adoption only on an
  unmerged branch.
- Q79, from spec review R-31, taken with the reviewer's first option under that instruction: `apply`
  and the `not-free-on-private` rule hold only on github.com; any other host gets `check` with
  `not-github-com`, proved by AC-27.
- Q80, from spec review R-32, taken with the reviewer's proposals under that instruction: every
  helper `gh` call passes `--hostname` with the validated origin host; rule 2 and the
  `code_scanning` entry apply only on github.com; `apply` refuses with `not-github-com` with or
  without a run; the goal and owner summary name the github.com limit.
- Q81, from spec review R-33, taken with the reviewer's proposals under that instruction: AC-24
  and the mode bullet list the non-github.com host among the `check` conditions; a 404 from a
  config-file lookup on the target's own default branch means absent, and the fakes answer so.
- Q82, from spec review R-34, taken with the reviewer's proposals under that instruction: a fixture
  whose target default branch differs from `--default-branch`; AC-08 failures use 500; the AC-27
  row also proves AC-24's host clause; the criteria preamble assumes no mode reason refuses `apply`.

## Scope

In scope:

- A helper that checks and applies repository security settings for one repository, with JSON and
  Markdown output.
- Dependabot alerts with the dependency graph, wherever the plan offers them.
- Dependabot security updates where Dependabot is configured and Renovate shows no signal.
- Secret scanning and push protection on public repositories.
- A read-only code scanning entry that marks private and internal repositories as unavailable for
  the plan when an admin read shows their paid features off, and the collector rule that records
  their code scanning surface the same way.
- A per-repository keep-off list and a `security_settings` opt-in in `.vh-adlc/maintenance.yaml`.
- Running the helper in every maintenance sweep before collection and during onboarding, with
  `apply` only where the consumer opted in and no restricting request applies, and the outcome in
  the sweep report, rendered from the helper's JSON, or the onboarding report.
- The collector rule for a Dependabot surface whose alerts were enabled in the same run.
- github.com only for writes and plan rules. On any other host, `apply` is refused with mode reason
  `not-github-com`, and the `not-free-on-private` rule does not apply, since the Renovate App login
  and the plan terms are github.com facts.
- Moving the `AGENTS.md` pin and the plugin pin in `plugins/vh-adlc/knowledge.md` to the revision
  where vhco-pro/docs#30 merged, with a plugin minor version bump in both `plugin.json` files.
- The authority row, maintenance skill step, onboarding text, reference pages and user-guide section
  for the above.

Out of scope:

- Private vulnerability reporting and any other setting the convention does not list. On bg-remove,
  `gh api repos/michielvha/bg-remove/private-vulnerability-reporting` returned `{"enabled":false}`.

- Turning any setting off, including Dependabot security updates beside Renovate. The report flags
  that overlap for the owner instead.
- Dependabot version updates and any `dependabot.yml` file. Those need a commit, not a setting.
- Enabling, buying or using paid GitHub Advanced Security features on private or internal
  repositories, and organization-level security configurations.
- Renovate configuration, including its `vulnerabilityAlerts` option.
- CodeQL and Scorecard on public repositories. The convention adds them as reusable workflows in a
  reviewed change. The helper never turns on CodeQL default setup, which would compete with that
  workflow. The sweep's existing code scanning surface still shows when no analysis ran.
- Any other change to how the collector classifies a 403 or 404.
- Restating the convention's policy in plugin pages; they link to it.
- Changing the ask-first rule for merged-branch deletion.

## Design

### Order of work

Implementation starts only after vhco-pro/docs#30 merges. Two pins decide where
`conventions/repository-security.md` resolves: this repository's `AGENTS.md` pin, and the plugin pin
in `plugins/vh-adlc/knowledge.md`, which consumers without their own pin use and which moves only in
a reviewed plugin change with a version bump (`plugins/vh-adlc/knowledge.md:7-9`,
`plugins/vh-adlc/references/loop.md:41-64`). Both are `a4e3d592`, where `vh-adlc knowledge --page
conventions/repository-security.md` returns `missing-page`. Both move to the revision where docs#30
merged, with a minor version bump in `plugins/vh-adlc/plugin.json` and
`plugins/vh-adlc/.claude-plugin/plugin.json`, so consumers without their own pin, or with a pin
at or after the docs#30 merge, resolve the page. Sweeps and onboarding do not request the page
through `vh-adlc knowledge`, so a consumer whose own older pin lacks it still sweeps normally. If docs#30
closes unmerged or changes the rules this design applies, the document returns to the owner before
implementation continues.

### Helper

New helper `plugins/vh-adlc/scripts/security-settings/`, shaped like the branch helper's `auto-delete`
(`plugins/vh-adlc/scripts/branches/branches.ts:273-284`):

```text
bun <plugin>/scripts/security-settings/cli.ts check --repo PATH [--default-branch BRANCH --default-commit SHA] [--repository OWNER/NAME] [--run-id ID] [--mode-reason TEXT] [--format json|markdown]
bun <plugin>/scripts/security-settings/cli.ts apply --repo PATH --default-branch BRANCH --default-commit SHA [--repository OWNER/NAME] [--run-id ID] [--format json|markdown]
```

`--repo` is the checkout whose `.vh-adlc/maintenance.yaml` applies. `--repository` selects the target
and defaults to that checkout's validated origin. `check` only reads. `apply` reads, writes each
setting that is off and free, then reads that setting again.

`--run-id` is the maintenance run the helper serves, written into the JSON; onboarding has no run
and omits it. `apply` reads `security_settings_keep_off` from the committed, linked settings at
`--default-commit` on `--default-branch`, bound as `resolveStanding` binds them
(`plugins/vh-adlc/scripts/maintenance/authority.ts:88-92`), and fails visibly when that binding
does not resolve. `apply` also makes no write, and reports its entries exactly as `check` would,
with the mode `check` and mode reason `not-github-com`, `not-adopted` or
`not-in-committed-scope`, when the host is not github.com, or those committed settings do not
adopt `security_settings: apply` or do not name `--repository` (the origin repository always
counts), with or without `--run-id`, so the opt-in holds even if the skill runs the wrong command.
When `apply` gets `--run-id`, it also reads that run's recorded request and scope and refuses every
write in the same way under the rules `security-settings-mode` applies (request flags, missing
`authorized_sweep`, a pull-request scope, a target outside the run's recorded
`scope.repositories`), with the reason that command would print, so current
restrictions do not rest on the skill alone either. When `apply` cannot read its `--run-id`
(missing, mismatched or broken run), it makes no write and exits nonzero naming the run. When the
committed settings are invalid, `apply` makes no write and exits nonzero naming the field; it never
falls back to the working tree as `check` does. The refusal reason is the first that applies
in the ordered mode reasons below, the same reason `security-settings-mode` would print. `check` reads keep-off rows from the committed
settings when given `--default-branch` and `--default-commit`, which the skill always passes, and
from the working tree otherwise; "exactly as `check` would" means `check` with the same binding.
These are mode reasons, not entry reasons: an off and free entry keeps `check-only` under rule 8. The committed file is validated against the key list `scripts/maintenance/settings.ts`
accepts, with the two new keys. When the binding fails or the committed settings are invalid,
`security-settings-mode` exits nonzero naming the cause, and the skill handles that like a helper
failure: it runs the helper in `check` with mode reason `committed-settings-unresolved` and the
cause, and never runs `apply`. Every nonzero exit of the command, whatever its cause, is handled
this way. `check` never fails on its binding: when the binding does not
resolve or the committed settings are invalid, it reads keep-off rows from the working tree and
reports `committed-settings-unresolved` with the cause as its mode reason. When the binding
resolves but the committed settings are unlinked or absent, `check` also reads keep-off rows from
the working tree, so an unlinked consumer's keep-off rows still count.
`check` also accepts `--mode-reason`, the reason `security-settings-mode` printed or the skill
chose; `apply` does not take it. The helper's own refusal or binding-failure reason takes
precedence over `--mode-reason`, and the output then shows both, the passed reason as detail;
the JSON and Markdown show the mode and that reason. The default JSON output holds the repository, its visibility, whether it is archived, the caller's
admin permission, the Renovate and Dependabot detection results with their evidence, and one entry
for each of `dependabot_alerts`, `dependabot_security_updates`, `secret_scanning` and
`secret_scanning_push_protection`. The `dependabot_alerts` entry covers the dependency graph, which
GitHub generates when alerts are enabled. On private and internal repositories on github.com the
output also has a read-only `code_scanning` entry. `--format markdown` prints the same data as a
`## Repository security settings` section with one table row per entry, followed by an
"Owner decisions" list of every entry with reason `renovate-overlap`, `owner-choice-conflict` or `paused`, or
"None." when there is none.

Each entry has one state:

| State | Meaning |
| --- | --- |
| `already-on` | Read as on before any write; reason `renovate-overlap` when it is Dependabot security updates and Renovate is present, `owner-choice-conflict` when the keep-off list names it, or `paused` when security updates read `paused` true |
| `enabled` | Off before, written, and read back as on |
| `left-off` | Deliberately not enabled; reason `renovate-present`, `renovate-unknown`, `renovate-detection-failed`, `dependabot-detection-failed` or `owner-choice` |
| `unavailable` | Not free for this repository; reason `not-free-on-private` or `archived` |
| `not-changed` | Off and free, but not written or not read back as on; reason `check-only`, `alerts-off` or `api-error` with the HTTP status |
| `unknown` | Not read; reason `needs-admin`, or `api-error` with the HTTP status or error when a read failed |

The exit code is 0 when no entry is `not-changed` or `unknown` and none has reason
`renovate-detection-failed` or `dependabot-detection-failed`, and 1 otherwise.

### Reads and writes

All through `gh api --hostname` with the host of the validated origin
(`plugins/vh-adlc/scripts/maintenance/settings.ts:63-75`), as `ghRead` does
(`plugins/vh-adlc/scripts/github-read.ts:54`), so neither `GH_HOST` nor the default host decides
where a read or write goes:

- `repos/{r}`: `visibility`, `archived`, `permissions.admin` and `security_and_analysis`.
- Dependabot alerts: `GET` and `PUT repos/{r}/vulnerability-alerts`.
- Dependabot security updates: `GET` and `PUT repos/{r}/automated-security-fixes`.
- `GET vulnerability-alerts` returns 204 when alerts are on and 404 when they are off.
  `GET automated-security-fixes` returns 200 with an `enabled` boolean that gives the state, or 404
  when Dependabot is not enabled, which means off. An HTTP success alone never means on. Its
  `paused` boolean, when true on an entry read as on, gives reason `paused`; the helper never
  unpauses it.
- Secret scanning and push protection: `PATCH repos/{r}` with `security_and_analysis`.

Alerts are written and read back first. Security updates are tried only when alerts read back as on;
otherwise their entry is `not-changed` with reason `alerts-off`. The helper calls no `code-scanning`
endpoint.

### Rules applied before any write

The helper first reads `repos/{r}`, which any caller can read. When that read fails, every one of
the four writable entries is `unknown` with reason `api-error` and the status or error, the helper
makes no other read or write, and it exits 1. Otherwise each entry takes the state and reason of
the first rule below that applies to it:

1. Archived (`archived`): the helper makes no admin-only read and no write, and every entry is
   `unavailable`.
2. Not free on a private or internal repository (`not-free-on-private`): secret scanning and push
   protection are `unavailable` unless the admin read shows them on. Rule 2 does not decide an
   entry read as on; it goes on to rule 5, giving `owner-choice-conflict` when kept off, and
   otherwise to rule 7, giving `already-on` with no reason.
   The helper calls none of their write endpoints there. The `code_scanning` entry is `unavailable`
   only when the caller is admin and `security_and_analysis` shows neither `advanced_security` nor
   `code_security` with status `enabled`, a null block included. When either is enabled, the output
   has no `code_scanning` entry, as on a public repository. Rule 2 applies only on github.com: on
   any other host, private and internal secret scanning and push protection read as off are
   `not-changed` with `check-only` under the `not-github-com` mode, and there is no `code_scanning`
   entry.
3. Not admin (`needs-admin`): when `permissions.admin` is false, the helper makes no admin-only read
   and no write, and every remaining entry is `unknown`.
4. Failed read (`api-error`): a read of a setting's own state that fails, other than the 404 that
   means off, makes the entry `unknown` with the status or error, and the helper makes no write for
   it. Renovate and Dependabot detection lookups are not reads of a setting's state; rule 6 handles
   their failures.
5. Keep-off list (`owner-choice` or `owner-choice-conflict`): a setting listed for the target
   repository under `security_settings_keep_off` is never written. It is `left-off` with
   `owner-choice`, or `already-on` with `owner-choice-conflict` when the read shows it on. The
   listed reason appears in the output. When the row lists `dependabot_alerts`, security updates
   read as off is also `left-off` with `owner-choice` and is never written, since it depends on
   alerts. When the row lists `secret_scanning`, push protection read as off is likewise `left-off`
   with `owner-choice` and never written.
6. Renovate and Dependabot rules, below, for `dependabot_security_updates`. They decide the entry
   only for rows that do not write; the "no signal, configured, off" row falls through to rules 7
   to 10.
7. Already on: an entry read as on is `already-on`.
8. Check mode (`check-only`): under `check`, an off and free entry is `not-changed`. This includes
   security updates the Renovate and Dependabot rules would enable, even while alerts are off.
9. Alerts off (`alerts-off`): under `apply`, security updates are `not-changed` when alerts are not
   read back as on, and no write is made for them.
10. Failed write (`api-error`): a write that fails is `not-changed` with its status. A write that
    succeeds but whose setting is not read back as on is `not-changed` with the write's status and
    the detail "not on after write". The helper still processes the remaining settings.

An entry has one reason. Security updates read as on with `paused` true take reason `paused` in
rule 6's "When on" cells and in rule 7, in place of `renovate-overlap` or no reason. Rule 5's
`owner-choice-conflict` comes first, since rule 5 decides the entry before rule 6.

Rules 1, 3 and 4 need no reading of the setting, or report that the read failed. Rule 2 infers
`unavailable` for private secret scanning and push protection from visibility alone when no admin
read exists, since those features are not free there.

### Renovate and Dependabot detection

Renovate is present when any of these match: a config file on the default branch at a location
Renovate documents (`renovate.json`, `renovate.jsonc`, `renovate.json5` at the root and under
`.github/` and `.gitlab/`, `.renovaterc`, `.renovaterc.json`, `.renovaterc.jsonc`,
`.renovaterc.json5`, or a `renovate` key in the root `package.json`); a pull request in any state
authored by `app/renovate`; or an open issue authored by `app/renovate` whose title contains
"Dependency Dashboard". The output names the matched path, pull request or issue. Detection
looks only for the managed Renovate App's `app/renovate` login and does not read the sweep's
`bot_authors` setting.

Dependabot is configured when `.github/dependabot.yml` or `.github/dependabot.yaml` exists on the
default branch.

The default branch for these lookups is the target repository's own `default_branch` from
`repos/{r}`, not the helper's `--default-branch`, which binds the consumer checkout. A 404 from a
config-file lookup there means the file is absent and counts as a successful lookup with no
match. Renovate has no signal only when every Renovate lookup succeeded and none matched. Any failed
Renovate lookup with no match elsewhere counts as failed, as does a failed Dependabot config lookup.

For `dependabot_security_updates`, with no write in any row except the second:

| Renovate | Dependabot | When off | When on |
| --- | --- | --- | --- |
| present | any | `left-off` with `renovate-present` | `already-on` with `paused` when paused, else `renovate-overlap` |
| no signal | configured | written, then `enabled` | `already-on` |
| no signal | not configured | `left-off` with `renovate-unknown` | `already-on` |
| a lookup failed, no match | any | `left-off` with `renovate-detection-failed` and the error | `already-on` |
| no signal | lookup failed | `left-off` with `dependabot-detection-failed` and the error | `already-on` |

The `renovate-unknown` row means a new repository the Renovate App covers gets no duplicate pull
requests before its first Renovate pull request (Q6). docs#30 states the same rule since `89d567a`
(Q13).

### Collector

`scripts/maintenance/collect.ts` already reads `repos/{r}` for each repository
(`plugins/vh-adlc/scripts/maintenance/collect.ts:215`). It also keeps the visibility,
`permissions.admin` and `security_and_analysis` from that read. The code scanning surface is
`complete-unavailable` with reason `not-free-on-private` and the status, with no configured
`surface_expectations` entry needed, only when all of these hold: the repository is private or
internal, the caller is admin, `security_and_analysis` shows neither `advanced_security` nor
`code_security` with status `enabled` (a null block included), and the code scanning alerts read
fails with 403 or 404, and the repository is on github.com. In every other case, including any
other host, a failed read stays incomplete, as today. A successful read still wins.

The `collect` command gains `--security-settings FILE`, repeatable, taking the helper's JSON. When
a file shows an alerts write was attempted for a repository, either `dependabot_alerts` as
`enabled` or as `not-changed` with `api-error` after a write, the collector records that
repository's Dependabot surface as incomplete with reason `alerts-enabled-this-run`, a null count,
as every incomplete surface has (`plugins/vh-adlc/scripts/maintenance/security-io.ts:43`), and the
alerts it read, since GitHub fills the list after the write. The next sweep, where alerts are
`already-on`, records it as usual.

With `--security-settings`, `collect` also takes `--run-id`. `collect` and `report` accept a file
only when it parses against the helper's JSON schema, carries the current run ID, names one
repository in the sweep's scope, and is the only file for that repository. Any other file, and
every file for a repository named more than once, is ignored for collection and shown in the
report as "helper did not run" with the reason. A bad file never fails either command.

The maintenance CLI rejects a repeated flag (`plugins/vh-adlc/scripts/maintenance/cli.ts:36`,
`references/maintenance-settings.md:100`). `--security-settings` and `--applied-repository` are a
named exception that may repeat, and that sentence of `references/maintenance-settings.md` says so.

`collect` also takes `--applied-repository OWNER/NAME`, repeatable, naming each repository for
which `security-settings-mode` printed `apply`. A named repository without an accepted helper file
gets its Dependabot surface recorded as incomplete with reason `helper-receipt-missing` and a null
count, since an alerts write may have happened without a receipt.

The operations table in `references/maintenance-settings.md:103-124` gains a
`security-settings-mode` row with its flags, and its `collect` and `report` rows gain the new
flags.

`references/maintenance-settings.md:46-48` and `references/maintenance.md:78-80` today say that only
a configured exact match is `complete-unavailable` and that a bare 403 or 404 is unknown. Both
change to name the `not-free-on-private` rule beside that match, and both also name
`alerts-enabled-this-run` and `helper-receipt-missing`.

### Settings

`references/maintenance-settings.md` and `scripts/maintenance/settings.ts` gain
`security_settings_keep_off`: rows of `{repository, settings, reason}`, where `repository` is in
declared scope, `settings` lists names from the four writable entries, and `reason` is required
text. Unknown setting names and duplicate repositories fail visibly, as for the other fields.

They also gain `security_settings`, `apply` or `check`, default `check`. Like the other standing
grants, it is read only from the consumer's committed default branch
(`plugins/vh-adlc/references/maintenance-settings.md:51-57`). Unlike them, it needs only the
committed `AGENTS.md` link to a valid committed `.vh-adlc/maintenance.yaml`, with no
`project_procedure` or publication declaration, which `resolveStanding` requires
(`plugins/vh-adlc/scripts/maintenance/authority.ts:103`). `resolveStanding` checks committed
settings against a fixed key list (`plugins/vh-adlc/scripts/maintenance/authority.ts:100`) and
returns `invalid` for any other key, so that list gains `security_settings` and
`security_settings_keep_off`; otherwise committing either would void the consumer's standing
publication grant.

Under `apply`, the keep-off rows and the list of repositories the sweep may write to are read from
the same committed, linked settings as the opt-in, not from the working tree that `loadSettings`
reads (`plugins/vh-adlc/scripts/maintenance/settings.ts:61-75`). A repository in the working
tree's scope that the committed settings do not name gets `check`, and a keep-off row removed only
in the working tree still applies.

Older helpers reject any settings key they do not list
(`plugins/vh-adlc/scripts/maintenance/settings.ts:12-14`). As for `security_policy`
(`plugins/vh-adlc/references/maintenance-settings.md:97`, `docs/reference/compatibility.md:96-97`),
both pages say older readers reject the two new keys and name the new plugin version as the minimum
for adopting either.

### Procedure changes

- `references/security-settings.md` (new) documents the commands, states, reasons, the endpoint
  responses that mean on and off, detection rules, keep-off list, precedence and authority. For
  which features a repository should have, it links to `conventions/repository-security.md` at the
  pinned docs revision instead of restating it.
- `scripts/maintenance/authority.ts` gains a mode function, and the maintenance CLI a
  `security-settings-mode --repository OWNER/NAME --default-branch BRANCH --default-commit SHA
  [--run-id ID]` command that prints the mode for that one repository with its reason, reading the
  committed settings through the same binding as `resolveStanding`. The origin repository always
  counts as named; another repository is `check` with reason `not-in-committed-scope` unless the
  committed `repositories` names it. The skill calls the command once per repository in scope and
  passes the printed reason to the helper's `check`; `apply` shows `adopted`. With a run, the mode is `check` when the recorded request lacks `authorized_sweep` true,
  has `read_only`, `draft_only`, `no_push` or `no_filesystem`
  (`plugins/vh-adlc/scripts/maintenance/authority.ts:13`), or when the run's scope has a pull
  request or does not include the repository, and also when the maintenance settings' `hostname`
  is not github.com or the committed settings do not adopt `security_settings: apply`. Otherwise
  it is `apply`. So among maintenance runs only a full authorized sweep writes, and onboarding
  writes only as the committed settings decide; a PR-scoped assessment checks. The helper
  runs once, before a new run's collection; a continuation reuses that run's saved files and does
  not run it again. `no_commit` alone does not select
  `check`, because a settings change is not a commit. Onboarding has no recorded maintenance
  request, so it runs the command without one and the committed settings alone decide, except
  that an onboarding request that is read-only or draft-only, or forbids pushing or filesystem
  writes, selects `check` without calling the command, as in a sweep.
- The mode reasons, checked in this order with the first that applies printed, are
  `request-restricted` (naming the request flag), `not-authorized-sweep`, `pull-request-scope`,
  `not-in-run-scope` (with a run, a target outside its recorded `scope.repositories`, which
  `start --repository` can narrow, `plugins/vh-adlc/scripts/maintenance/cli.ts:68`),
  `not-github-com` (the maintenance settings' `hostname`, `references/maintenance-settings.md:16`,
  is not github.com), `not-adopted` and `not-in-committed-scope`; `apply` has reason `adopted`. The skill's own
  selections use `request-restricted` for a restricted request, and the binding-failure fallback
  uses `committed-settings-unresolved` with the cause.
- For an `alerts-enabled-this-run` surface, the maintenance skill records a coverage handoff in the
  security analysis's `coverage_handoffs`, with the repository, surface `dependabot` and a handoff
  of `reference` set to the run ID, `owner` null, `assignment_handoff` naming the next maintenance
  sweep and `next_action` to collect the surface again (the shape `followUp` requires,
  `plugins/vh-adlc/scripts/maintenance/security.ts:53-56`), since only `owner` or `assignment_handoff` makes a
  handoff tracked (`plugins/vh-adlc/scripts/maintenance/security.ts:117`), as `security-reconcile` requires for any incomplete
  surface (`plugins/vh-adlc/scripts/maintenance/security.ts:143`,
  `plugins/vh-adlc/references/maintenance.md:327`).
- The maintenance skill gets a step before collection: for each repository in scope, run the helper
  in that mode with the run ID and the default-branch binding, save its JSON, then collect with
  those files and an
  `--applied-repository` for each repository run in `apply`. A helper failure or exit 1 never
  blocks collection. Under `check`, the report says how to opt in. A request that forbids
  filesystem writes creates no recorded run (`plugins/vh-adlc/scripts/maintenance/cli.ts:66-67`),
  so for it the skill selects `check` without calling `security-settings-mode`, keeps the helper's
  output in chat and saves no JSON. Otherwise the skill saves each helper JSON in the run's private
  journal directory, as the branch plan is (`plugins/vh-adlc/references/branches.md:80-81`). The
  recorded run and its request are the intent for the helper's writes, and the saved JSON is their
  receipt, meeting the intent-then-receipt rule (`plugins/vh-adlc/references/maintenance.md:55`).
- `references/maintenance.md:218-219` says report helpers never mutate GitHub except the branch
  helper. That sentence gains the security-settings helper's `apply`, under the authority row below.
- The maintenance skill's and onboarding's `vh-adlc knowledge` page lists do not include
  `conventions/repository-security.md`, so a consumer pinned before docs#30 still sweeps.
- The maintenance CLI's report command gains `--security-settings FILE`, repeatable, taking the
  helper's JSON output, and `renderReport` in `scripts/maintenance/report.ts` gains a matching input.
  The saved report then has a `## Repository security settings` section after `## Security alerts`:
  one table per repository, rendered by the same function as the helper's Markdown, and one
  "Owner decisions" list across all repositories. The section names every repository in scope,
  with a "helper did not run" row for one without a file, so no repository drops out silently.
  Every sweep report renders the section, also with no `--security-settings` flag, when it then
  holds a "helper did not run" row for each repository in scope. `renderReport` names the
  `security_settings: apply` opt-in unless at least one file is accepted and every accepted file's
  mode is `apply`; a rejected file's claimed mode does not count.
  `references/maintenance.md` documents the section.
- `references/authority.md` gets a row: a maintenance sweep or onboarding may enable these settings
  with `apply` on a repository in its scope only when the consumer's committed settings adopt
  `security_settings: apply`. For maintenance runs, a request with a flag that selects `check`, a
  request without `authorized_sweep` true, and a pull-request scope each give `check`; onboarding
  applies only as the committed settings decide. Nothing grants turning a setting off. That adoption is the owner's
  agreement that `guides/onboard-a-repository.md` in vhco-pro/docs asks for before turning these
  settings on, and `references/security-settings.md` says so.
- `references/loop.md:70-73` and `references/lifecycle.md:64` add that onboarding runs the helper in
  the same mode and reports its output beside the merged-branch deletion check. Like that check, it is a repository
  change, not a commit, and never holds up the onboarding commit. Onboarding usually runs in
  `check`, because its own commit is what links the settings. Under `check` it reports the states,
  says how to opt in, and records the onboarding guide's security checklist item as pending the
  owner's choice; it never runs the guide's manual commands or the helper's `apply` on an
  in-session yes.
- `docs/user-guides/workflows.md` gets a section beside "Stale branches" describing the default and
  the manual commands. The merged-branch deletion text stays as it is.

## Acceptance Criteria

Each criterion covers the entries no earlier rule under "Rules applied before any write" decides,
with every read and write succeeding, unless it names another case. Criteria about `apply` also
assume no mode reason refuses it: the host is github.com, the committed settings adopt `apply`
and name the target, and no recorded run restricts it.

- [ ] AC-01: After `apply` on an unarchived repository where the caller is admin, Dependabot alerts are
      off and the keep-off list does not name them,
      `GET repos/{r}/vulnerability-alerts` returns 204 and the output lists `dependabot_alerts` as
      `enabled`.
- [ ] AC-02: After `apply` on a repository with any documented Renovate config location, an
      `app/renovate` pull request, or an open `app/renovate` Dependency Dashboard issue, Dependabot
      security updates are still off and listed as `left-off` with reason `renovate-present` and the
      matched path, pull request or issue.
- [ ] AC-03: After `apply` on an unarchived repository with a `.github/dependabot.yml` or
      `.github/dependabot.yaml` and no Renovate signal, where the caller is admin, alerts read back on
      and the keep-off list does not name security updates, Dependabot security
      updates are on and listed as `enabled`. With neither file and no Renovate signal, they stay off
      and are listed as `left-off` with reason `renovate-unknown`.
- [ ] AC-04: After `apply` on an unarchived public repository where the caller is admin and the
      keep-off list names neither, secret scanning and push protection are each listed as `enabled`
      or `already-on`, and no call to any `code-scanning`
      endpoint was made.
- [ ] AC-05: After `apply` on an unarchived private or internal repository where the caller is admin
      and every setting starts off,
      `dependabot_alerts` is read back on and listed as `enabled`, no write call was made for secret
      scanning or push protection, and those two entries are `unavailable` with reason
      `not-free-on-private`. When `security_and_analysis` is null, the `code_scanning` entry is
      `unavailable` with the same reason; when it shows `code_security` enabled, the output has no
      `code_scanning` entry. On an archived repository, `apply` makes no write call and every entry
      is `unavailable` with reason `archived`.
- [ ] AC-06: When the caller is not admin on an unarchived public repository, `apply` makes no write
      call and no admin-only read, lists every entry as `unknown` with reason `needs-admin`, and
      exits 1. `check` never makes a write
      call; it lists every off and free setting that rules 1 to 7 do not decide as `not-changed` with
      reason `check-only`, and exits 1 when there is at least one.
- [ ] AC-07: `apply` never makes a write call that turns a setting off. After an `apply` that exited
      0, a second `apply` on the same repository makes no write call
      and lists every setting as `already-on`, `left-off` or `unavailable`.
- [ ] AC-08: When any Renovate detection lookup fails and no other lookup matches, Dependabot security
      updates that are off stay off and are listed as `left-off` with reason
      `renovate-detection-failed` and the error. When every Renovate lookup succeeds without a match
      and the Dependabot config lookup fails, they stay off and are listed as `left-off` with reason
      `dependabot-detection-failed` and the error. In each case the helper exits 1.
- [ ] AC-09: When one write fails, that setting is `not-changed` with reason `api-error` and the HTTP
      status, the remaining settings are still processed, and `apply` exits 1. A write that succeeds
      but is not read back as on gives `not-changed` with `api-error`, the write's status and
      "not on after write".
- [ ] AC-10: `--format markdown` prints a `## Repository security settings` section with one row per
      entry giving its state and reason, followed by an "Owner decisions" list holding exactly the
      entries with reason `renovate-overlap`, `owner-choice-conflict` or `paused`, matching the JSON output for
      the same run.
- [ ] AC-11: `references/security-settings.md`, `references/authority.md`, `references/maintenance.md`,
      `references/maintenance-settings.md`, `references/loop.md`, `references/lifecycle.md`, the
      maintenance skill and `docs/user-guides/workflows.md` state the following. A clause that names
      no page needs to appear only in `references/security-settings.md`, which the other listed
      pages link to; a clause that names pages must appear in each of them. Sweeps and onboarding run the
      helper before collection in the mode `security-settings-mode` prints; the `security_settings`
      opt-in and the flags that select `check`, in sweeps and, in `references/loop.md` and
      `references/lifecycle.md`, in onboarding; the Renovate and Dependabot rules; the private,
      archived and keep-off rules; that `renovate-overlap`, `owner-choice-conflict` and `paused` go to the
      owner; the precedence order; that `apply` and the `not-free-on-private` rule hold only on
      github.com, with `not-github-com` elsewhere; the `not-free-on-private`, `alerts-enabled-this-run` and
      `helper-receipt-missing` collector rules, in `references/maintenance.md` and `references/maintenance-settings.md`
      such that neither page still says only a configured or exactly declared match is
      `complete-unavailable`; that `--security-settings` and `--applied-repository` are a named
      exception to the duplicate-flag rule in `references/maintenance-settings.md`; the operations table in
      `references/maintenance-settings.md` listing `security-settings-mode` with its flags and the
      new `collect` and `report` flags; that a helper failure never blocks
      collection, stated in the maintenance skill's step; in the maintenance skill's step, that it
      runs the helper and passes its files with `--security-settings` to `collect` and `report` and
      `--applied-repository` to `collect`; in `references/maintenance.md`, that its "one exception"
      sentence lists the security-settings helper's `apply` beside the branch helper, with the
      recorded run as intent and the JSON saved in the run's private journal directory as receipt,
      and that it documents the `## Repository security settings` report section; that no setting is
      ever turned off; and, in the authority row and `references/security-settings.md`, that adopting
      `security_settings: apply` is the agreement the onboarding guide asks for; in the maintenance
      skill, `references/security-settings.md` and the authority row, that among maintenance runs only a full
      sweep whose request has `authorized_sweep` true may apply, onboarding applies only as the
      committed settings decide, a pull-request-scoped run checks, and a
      continuation reuses the run's helper files without running it again; and, in the maintenance
      skill, that an `alerts-enabled-this-run` surface gets a row in `coverage_handoffs` with the
      repository, surface `dependabot` and a handoff of `reference` set to the run ID, `owner` null,
      `assignment_handoff` naming the next maintenance sweep and `next_action` to collect the surface
      again;
      and, in `references/loop.md` and `references/lifecycle.md`, that onboarding under `check`
      reports the states, says how to opt in, records the guide's security checklist item as pending
      the owner's choice, and never runs the guide's manual commands or `apply` on an in-session yes;
      and, in the maintenance skill, `references/loop.md` and `references/lifecycle.md`, that a
      nonzero `security-settings-mode` exit, whatever its cause, leads to `check` with mode reason
      `committed-settings-unresolved` and the cause, and never to `apply`; and, in
      `docs/user-guides/workflows.md`, a section beside "Stale branches" stating the `check` default,
      the `security_settings: apply` opt-in and the manual commands, and linking to
      `references/security-settings.md`.
      `references/security-settings.md` links to `conventions/repository-security.md` at the plugin
      pin, and that revision contains the page. The maintenance skill's and onboarding's
      `vh-adlc knowledge` page lists do not include `conventions/repository-security.md`.
      `references/maintenance-settings.md` and `docs/reference/compatibility.md` state that older
      readers reject `security_settings` and `security_settings_keep_off`, as they do for
      `security_policy`, and name the new plugin version as the minimum for adopting either key.
- [ ] AC-12: After a maintenance sweep of `michielvha/bg-remove`, its saved report has a
      `## Repository security settings` section that lists Dependabot alerts `already-on`,
      Dependabot security updates `left-off` with reason `renovate-present`, and secret scanning and
      push protection `already-on`.
- [ ] AC-13: When alerts are not read back as on, `apply` makes no write to
      `automated-security-fixes` and lists Dependabot security updates as `not-changed` with reason
      `alerts-off`.
- [ ] AC-14: When Renovate is present and Dependabot security updates are already on, `apply` leaves
      them on, lists them as `already-on` with reason `renovate-overlap`, and the Markdown output
      lists them under owner decisions.
- [ ] AC-15: On an unarchived public repository where the caller is admin, an off setting listed for
      the target repository in `security_settings_keep_off` is never written and is listed as
      `left-off` with reason `owner-choice` and the configured reason. A
      settings file naming an unknown setting fails visibly.
- [ ] AC-16: In a maintenance collection of a private or internal repository where the caller is
      admin, `security_and_analysis` shows neither `advanced_security` nor `code_security` enabled,
      and the code scanning alerts read returns 403 or 404, the code scanning surface is
      `complete-unavailable` with reason `not-free-on-private` and that status, without a
      `surface_expectations` entry. Without admin, or with either feature enabled, the same read
      leaves the surface incomplete.
- [ ] AC-17: A setting listed in `security_settings_keep_off` that the first read shows on is not
      written, is listed as `already-on` with reason `owner-choice-conflict`, and appears in the
      Markdown owner decisions list, including when the committed settings are unlinked or absent
      and the row is in the working tree's settings.
- [ ] AC-18: On an unarchived public repository where the caller is admin, when the read of a setting
      fails with a status other than the 404 that means off, that entry is `unknown` with reason
      `api-error` and the status, even when the keep-off list names it, no write is made for it, the
      other settings are still processed, and `apply` exits 1. A 404 from either `GET` endpoint, and
      a 200 from `GET automated-security-fixes` with `enabled` false, are treated as off.
- [ ] AC-19: When several rules apply to one entry, its state and reason come from the first that
      applies in the numbered order under "Rules applied before any write", and under `check` an off
      security-updates entry the Renovate and Dependabot rules would enable is `not-changed` with
      `check-only` even while alerts are off. In a repository with `dependabot.yml`, no Renovate,
      both off and a keep-off row for `dependabot_alerts`, `apply` leaves alerts and security
      updates `left-off` with `owner-choice` and exits 0. On a public repository with both secret
      settings off and a keep-off row for `secret_scanning` only, `apply` leaves both `left-off`
      with `owner-choice` and writes neither.
- [ ] AC-20: `AGENTS.md` and `plugins/vh-adlc/knowledge.md` pin the vhco-pro/docs revision where #30
      merged, both `plugin.json` files carry the same new minor version, and
      `vh-adlc knowledge --page conventions/repository-security.md` resolves the page at that pin.
- [ ] AC-21: When `apply` enables Dependabot alerts and the collector then runs with the helper's
      JSON, the collector keeps the open alerts it reads and records the Dependabot surface as
      incomplete with reason `alerts-enabled-this-run` and a null count, also when the list is still
      empty. `security-reconcile` accepts that inventory and reports the gap
      `coverage handoff pending` for the surface unless the analysis records a coverage handoff for
      it; the maintenance skill records one naming the next sweep. The same holds when the file shows
      `dependabot_alerts` as `not-changed` with `api-error` after a write. With alerts
      `already-on`, a successful read stays complete.
- [ ] AC-22: Every sweep report, with or without `--security-settings` files, has a
      `## Repository security settings` section after `## Security alerts` that names every
      repository in scope: one table per repository with a file, whose rows match its JSON entries,
      a "helper did not run" row for each repository without one, and an "Owner decisions" list
      holding exactly the entries with `renovate-overlap`, `owner-choice-conflict` or `paused` across all files.
      The section names the `security_settings: apply` opt-in unless at least one helper file is
      accepted and every accepted file's mode is `apply`; a rejected file's claimed mode does not
      count.
- [ ] AC-23: When the helper's `repos/{r}` read fails, every writable entry is `unknown` with reason
      `api-error` and the status, no other read or write is made, and the helper exits 1. The
      collector covers every repository in scope when given helper files for only some of them.
      A helper file that is malformed, names a repository outside the scope, repeats a repository
      or carries another run ID changes no surface, fails neither `collect` nor `report`, and shows
      as "helper did not run" with the reason. A repository passed with `--applied-repository` and
      no accepted helper file gets an incomplete Dependabot surface with `helper-receipt-missing`.
- [ ] AC-24: `security-settings-mode` prints `check` when the recorded request has `read_only`,
      `draft_only`, `no_push` or `no_filesystem`, or when the committed settings do not adopt
      `security_settings: apply`, or when the recorded request lacks `authorized_sweep` true, or
      when the run's scope has a pull request, or when the repository is outside the run's recorded
      `scope.repositories`, or when the maintenance settings' `hostname` is not github.com;
      otherwise it prints `apply`, also with no recorded request. A
      request with only `no_commit` gets `apply` when the settings adopt it. A `security_settings`
      value other than `apply` or `check` fails visibly. A value of `apply` present only in the
      working tree, only on an unmerged branch, or in a settings file `AGENTS.md` does not link gives
      `check`, both from `security-settings-mode` and from the helper's `apply`, which never reads
      adoption from the working tree. Under `apply`, a keep-off row present in the committed settings but removed in the
      working tree still applies, and a repository added only in the working tree's `repositories`
      gets `check` with reason `not-in-committed-scope`, while the origin repository always counts as
      named. A committed `security_policy` key does not prevent `apply`. A binding failure or invalid
      committed settings make `security-settings-mode` exit nonzero naming the cause, and the
      helper's `check` given that binding still reports its entries, with mode reason
      `committed-settings-unresolved`. The helper's
      `apply` makes no write, and reports its entries exactly as `check` would, with mode `check`,
      when the bound committed settings do not adopt `security_settings: apply` or do not name the
      target, or when its `--run-id` names a run whose recorded request or scope selects `check`; its
      mode reason is the first that applies in the ordered mode reasons, the same reason
      `security-settings-mode` would print. It makes no write and exits nonzero naming the cause
      when its binding does not resolve, the committed settings are invalid, or its `--run-id`
      cannot be read. The maintenance skill states that a
      current request forbidding filesystem writes selects `check` without calling
      `security-settings-mode`, with the helper's output kept in chat and no JSON saved.
- [ ] AC-25: A consumer whose committed settings hold `security_settings` and
      `security_settings_keep_off` keeps an adopted standing report-publication grant.
- [ ] AC-26: Under `apply`, security updates read as `{"enabled":true,"paused":true}` are
      `already-on` with reason `paused`, with or without a Renovate signal, unless the keep-off list
      names them, which gives `owner-choice-conflict`. No write is made, the helper exits 0 when no
      other entry fails, and the Markdown owner decisions list names the entry.
- [ ] AC-27: When the maintenance settings' `hostname` is not github.com, `security-settings-mode`
      prints `check` with `not-github-com` even when the committed settings adopt `apply`; the
      helper's `apply` makes no write and reports that mode reason; the helper never gives an entry
      reason `not-free-on-private` and has no `code_scanning` entry for that host; every `gh` call it
      makes passes `--hostname` with that host; and the collector never records
      `not-free-on-private` for that host.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01, AC-03, AC-04 | `bun test tests/vh-adlc/security-settings` with a fake `gh` that records every call, keeps settings state, and denies admin-only reads, rejects a security-updates write while alerts are off and answers a lookup of an absent file with 404, as GitHub does. Fixture: public repository, admin, every setting off, `.github/dependabot.yml`, no Renovate. Pass: the four settings written once, read back on and reported `enabled`, and no `code-scanning` call recorded. A second fixture with no `dependabot.yml` passes when security updates are `left-off` with `renovate-unknown` and no `automated-security-fixes` write was recorded. A third fixture identical to the first but with only `.github/dependabot.yaml` passes when security updates are `enabled`. A fourth fixture is a target whose `default_branch` is `master`, holding `.github/dependabot.yml`, run with `--default-branch main`, against a fake that answers a contents lookup on any ref other than the target's `default_branch` with 404; it passes when security updates are `enabled`. |
| AC-02 | Same suite, one fixture per documented config location, one with a `renovate` key in `package.json`, one with only an `app/renovate` pull request, and one with only an open Dependency Dashboard issue. Pass: no write to `automated-security-fixes`, entry `left-off` with `renovate-present` and the matched evidence. |
| AC-05 | Same suite, fixtures: private repository, internal repository and archived public repository, each with every setting off. `security_and_analysis` is null in the private and internal fixtures, and a third private fixture shows `code_security` enabled. Pass: the private and internal runs record writes only to `vulnerability-alerts` and `automated-security-fixes`, `dependabot_alerts` is read back and `enabled`, and secret scanning, push protection and `code_scanning` are `unavailable` with `not-free-on-private`; the third has no `code_scanning` entry; the archived run records no writes and every entry is `unavailable` with `archived`. |
| AC-06 | Same suite, unarchived public fixture with `permissions.admin: false` run with `apply`, and the first fixture run with `check`. Pass: zero write calls in both and no admin-only read in the first; entries `unknown` with `needs-admin`, or `not-changed` with `check-only`; exit code 1. |
| AC-07 | Same suite: a second `apply` on the first fixture's resulting state, after a first run that exited 0, records no writes and reports only `already-on`, `left-off` or `unavailable`. A further fixture whose first run has a failed Renovate lookup: that run exits 1. Across every fixture, no recorded write has a body or endpoint that disables a setting. |
| AC-08 | Same suite, public admin fixtures with security updates off and `.github/dependabot.yml`: every Renovate lookup fails with 500; only the `renovate.json` lookup fails with 500 and the others match nothing; every Renovate lookup succeeds without a match and the `.github/dependabot.yml` lookup fails with 500. A 404 is not a failure for these lookups. Pass: no write to `automated-security-fixes` in any; the first two give `left-off` with `renovate-detection-failed` and the error, the third `left-off` with `dependabot-detection-failed` and the error; exit code 1 in all three. |
| AC-09 | Same suite, fixture where the `PATCH repos/{r}` write returns 422. Pass: secret scanning entries `not-changed` with `api-error` and 422, other settings still `enabled`, exit code 1. A second fixture where `PUT automated-security-fixes` returns 204 but the read-back gives `{"enabled":false,"paused":false}`. Pass: security updates `not-changed` with `api-error`, 204 and "not on after write", exit code 1. |
| AC-10 | Same suite: run the first fixture and the AC-14 fixture with both formats. Pass: the Markdown section has one row per JSON entry with the same state and reason, and its owner decisions list holds exactly the JSON entries with `renovate-overlap`, `owner-choice-conflict` or `paused`, or "None." |
| AC-11, AC-20 | The reviewer reads the eight files, `docs/reference/compatibility.md`, `AGENTS.md`, `plugins/vh-adlc/knowledge.md` and both `plugin.json` files at the implementation commit, confirms each listed rule is stated, the maintenance skill's and onboarding's `knowledge` page lists omit `conventions/repository-security.md`, the merged-branch deletion rule is unchanged, both pins name the docs#30 merge revision and both versions match a minor bump, then runs `vh-adlc knowledge --page conventions/repository-security.md` with the new plugin pin. Pass: the page resolves. |
| AC-12 | Manual: run a maintenance sweep of `michielvha/bg-remove` with the implemented plugin and read the saved report. Pass: the section shows the listed states. Limit: every setting there is already on or left off, so no live run shows a sweep enabling alerts and collecting them in the same run; the AC-21 fixture covers that path. |
| AC-13 | Same suite, fixture where the alerts write returns 403. Pass: no `automated-security-fixes` write recorded, entry `not-changed` with `alerts-off`, exit code 1. |
| AC-14 | Same suite, fixture with a Renovate config file and security updates already on. Pass: no write recorded, entry `already-on` with `renovate-overlap`, and the Markdown output lists it under owner decisions. |
| AC-15 | Same suite, public admin fixture with secret scanning off and a `.vh-adlc/maintenance.yaml` keep-off row for it, and one naming an unknown setting. Pass: no secret scanning write, entry `left-off` with `owner-choice` and the configured reason; the second run fails and names the field. |
| AC-17 | `bun test tests/vh-adlc/security-settings`, fixture: public repository with push protection on and a keep-off row for it. Pass: no write recorded for it, entry `already-on` with `owner-choice-conflict`, listed in the Markdown owner decisions. Three more fixtures run `check` with a resolved binding and a keep-off row for push protection, which reads as on, only in the working tree's settings: one whose committed `AGENTS.md` does not link the settings, one with no committed `AGENTS.md` or settings file, and one whose `AGENTS.md` links a settings file that was never committed. Each passes on the same outcome. |
| AC-18 | Same suite, public admin fixtures with `.github/dependabot.yml` and no Renovate: `GET automated-security-fixes` returns 500, once without and once with a keep-off row for it; `GET vulnerability-alerts` returns 404; `GET automated-security-fixes` returns 200 with `{"enabled":false,"paused":false}`. Pass: the 500 runs give that entry `unknown` with `api-error` and 500, no write to it, other settings processed, exit code 1; the 404 run writes alerts and reports `enabled`; the 200 run writes security updates and reports `enabled`. |
| AC-19 | Same suite, fixtures: archived private repository run by a non-admin; private admin repository with a keep-off row for secret scanning; private non-admin repository; `check` on a public admin repository with alerts off, `dependabot.yml` and no Renovate. Pass: every entry `unavailable` with `archived` and no admin-only read, exit code 0; secret scanning `unavailable` with `not-free-on-private`; secret scanning and push protection `unavailable` with `not-free-on-private`, alerts, security updates and `code_scanning` `unknown` with `needs-admin`; security updates `not-changed` with `check-only`. A further `apply` fixture: public admin repository with `dependabot.yml`, no Renovate, alerts and security updates off, and a keep-off row for `dependabot_alerts`. Pass: both `left-off` with `owner-choice`, no write recorded, exit code 0. Another `apply` fixture: public admin repository, secret scanning and push protection off, a keep-off row for `secret_scanning` only. Pass: both `left-off` with `owner-choice`, no `PATCH repos/{r}` recorded. |
| AC-22 | `bun test tests/vh-adlc/maintenance`: render a report for four repositories in scope with three `--security-settings` files, holding a `renovate-overlap`, a `paused` and an `owner-choice-conflict` entry in different repositories. Pass: the section follows `## Security alerts`, each table's rows match its file's entries, the fourth repository has a "helper did not run" row, and the owner decisions list holds exactly those three entries. A second report rendered with no `--security-settings` flag. Pass: the section is present with a "helper did not run" row for each repository in scope. In the first report, where one file's mode is `check`, the section names the `security_settings: apply` opt-in. A third report whose files are all in `apply` has no opt-in line. A report with no files names the opt-in, since no repository is known to be in `apply`. A report whose accepted files are all in `apply` plus one rejected file from another run claiming `check` has no opt-in line. A report whose given files are all rejected and claim `apply` names the opt-in. |
| AC-23 | `bun test tests/vh-adlc/security-settings`, fixture where `repos/{r}` returns 500, and `bun test tests/vh-adlc/maintenance` with a two-repository collector fixture given a helper file for the second repository only. Pass: four `unknown` entries with `api-error` and 500, no other recorded call, exit code 1; the collection covers both repositories. Further `collect` and `report` fixtures each add one bad file listing `dependabot_alerts` as `enabled`: malformed JSON, an out-of-scope repository, a second file for the same repository, and another run ID. Pass: both commands exit 0, no surface gets `alerts-enabled-this-run` from the bad file, and the report shows "helper did not run" with the reason. A last `collect` fixture passes `--applied-repository` for a repository whose alerts endpoint returns alerts and whose helper file is missing. Pass: that Dependabot surface is incomplete with `helper-receipt-missing` and a null count. |
| AC-24 | `bun test tests/vh-adlc/maintenance`: `security-settings-mode` with settings adopting `apply` and a request with each of `read_only`, `draft_only`, `no_push`, `no_filesystem` and `no_commit`; with settings adopting `apply` and no request; with settings that do not adopt it and no request; and with `security_settings: maybe` in the working tree. Pass: `check` with `request-restricted` naming the flag for the first four, `apply` for `no_commit`, `apply` then `check` with `not-adopted` for the next two, and a visible failure naming the field for the last. Further fixtures with committed settings adopting `apply` and a committed keep-off row for secret scanning: the working tree drops that row (pass: secret scanning not written, `left-off` with `owner-choice`), and the working tree adds a repository to `repositories` (pass: `check` with `not-in-committed-scope` for that repository, `apply` for the origin repository, and the helper's JSON for the added repository shows that mode and reason). Further fixtures with settings adopting `apply`: a request `{ "authorized_sweep": false }`, and an authorized run scoped to one pull request; they give `check` with `not-authorized-sweep` and `pull-request-scope` respectively. A fixture adopting `apply` in committed settings with no `project_procedure` gives `apply`; one that also commits `security_policy` gives `apply`; one whose `--default-commit` differs from `origin/<branch>` exits nonzero naming the cause, and the helper's `check` with that same binding then exits as usual with entries and mode reason `committed-settings-unresolved` naming the cause. Another, for a public admin repository with secret scanning off, commits `security_settings: maybe` and no keep-off row, with a valid working tree holding a keep-off row for secret scanning. Pass: `security-settings-mode` exits nonzero naming the field, and the helper's `check` with that binding reports secret scanning `left-off` with `owner-choice` from the working-tree row and mode reason `committed-settings-unresolved`. `bun test tests/vh-adlc/security-settings`, seven `apply` fixtures with expected mode reasons: (1) committed settings that do not adopt `apply`, `not-adopted`; (2) a target they do not name, `not-in-committed-scope`; (3) `--run-id` for a run recorded with `read_only` and settings that adopt `apply`, `request-restricted` naming `read_only`; (4) `--run-id` for a run scoped to a pull request and settings that adopt `apply`, `pull-request-scope`; (5) settings that do not adopt `apply` and a `read_only` run, `request-restricted`; (6) a run recorded with `{"authorized_sweep": false}` and settings that adopt `apply`, `not-authorized-sweep`; (7) a run started with `--repository` for another repository, settings that adopt `apply` and `apply` targeting the origin, `not-in-run-scope`. Pass for all seven: no write recorded, entries identical to `check` output with the same binding, mode `check`, and the listed reason. An eighth `apply` fixture with a `--run-id` that does not exist passes when no write is recorded and the helper exits nonzero naming the run. A ninth `apply` fixture whose `--default-commit` differs from `origin/<branch>` passes when no write is recorded and the exit is nonzero naming the cause. A tenth `apply` fixture commits `security_settings: maybe` beside a working tree that adopts `apply`; it passes when no write is recorded and the exit is nonzero naming the field. An eleventh `apply` fixture uses a run whose event chain is broken; it passes when no write is recorded and the exit is nonzero naming the run. A mode fixture with committed settings that do not adopt `apply` and a `read_only` request prints `request-restricted`. Further `security-settings-mode` fixtures where `apply` is only in the working tree, only on an unmerged branch, or in a settings file `AGENTS.md` does not link: each gives `check` with `not-adopted`. Four more helper `apply` fixtures, one with no committed `AGENTS.md` or settings file, one whose committed `AGENTS.md` does not link the settings, one whose committed `AGENTS.md` links a settings file that was never committed, and one where adoption is committed only on a checked-out unmerged branch while `--default-commit` does not adopt it, each beside a working tree that adopts `security_settings: apply`, pass when no write is recorded, the mode is `check` with `not-adopted`, and the entries match `check` with the same binding. A mode fixture with a run started with `--repository` for a configured non-origin repository, committed settings that adopt `apply` and `--repository` set to the origin gives `check` with `not-in-run-scope`. The reviewer also reads the maintenance skill step at the implementation commit and confirms the `no_filesystem` rule is stated. |
| AC-26 | `bun test tests/vh-adlc/security-settings`, public admin fixtures with alerts on and `automated-security-fixes` returning `{"enabled":true,"paused":true}`: one with `dependabot.yml` and no Renovate, one with `renovate.json`, one with a keep-off row for security updates. Pass: `paused`, `paused`, then `owner-choice-conflict`, all `already-on`; no `PUT automated-security-fixes` recorded; exit code 0; each appears in the Markdown owner decisions list. |
| AC-24, AC-27 | `bun test tests/vh-adlc/maintenance` and `bun test tests/vh-adlc/security-settings`, fixtures whose committed settings adopt `apply` and set `hostname` to `ghe.example.com` with a matching `repository`. Pass: `security-settings-mode` prints `check` with `not-github-com`; the helper's `apply` records no write, mode `check` with `not-github-com`, and entries identical to `check` with the same binding; a private admin fixture on that host whose code scanning read returns 403 with `security_and_analysis` showing neither paid feature leaves the surface incomplete, not `complete-unavailable`; the helper's `check` for a private admin repository on that host with secret scanning off and neither paid feature on has no `not-free-on-private` reason and no `code_scanning` entry; every `gh` call the fake records carries `--hostname ghe.example.com`, also with `GH_HOST` set to another host. |
| AC-25 | `bun test tests/vh-adlc/maintenance`: `resolveStanding` on committed settings with an adopted publication grant plus `security_settings: apply` and one `security_settings_keep_off` row. Pass: the grant resolves as adopted, not `invalid`. |
| AC-16 | `bun test tests/vh-adlc/maintenance` with collector fixtures for a private admin repository with `security_and_analysis` null whose code scanning read returns 403, and one returning 404. Pass: the surface is `complete-unavailable` with `not-free-on-private` and the status. An internal admin repository with `security_and_analysis` null and the same 403 is also `complete-unavailable`. Fixtures with the same 403 on a public repository, on a private repository read without admin, on a private repository with `code_security` enabled, and on a private repository with only `advanced_security` enabled stay incomplete. |
| AC-21 | `bun test tests/vh-adlc/maintenance` with one fake `gh` state shared by the helper and the collector: public admin repository, alerts off, three open Dependabot alerts that the alerts endpoint returns only once alerts are on; a second fixture whose endpoint returns an empty list on the first read after the write; a third with alerts already on; a fourth where the PUT returns 204, the read-back returns 404 and the alerts endpoint then returns one of three alerts. Run `apply`, then the collector with the helper's JSON. Pass: the first keeps three alerts, the second none and the fourth one, each with the surface incomplete, `alerts-enabled-this-run` and a null count, and `security-reconcile` runs on the first, second and fourth inventories, each once without a handoff and once with the handoff the Design specifies, accepting each and reporting `coverage handoff pending` only in the run without a handoff; the third is complete. The skill's handoff instruction is checked by the AC-11 reviewer read. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-10 | R-1 | spec | `1a93d2f` | claude-opus-4.8 | procedural | 12 findings: 8 should-fix, 4 nits, none blocking |
| 2026-11-10 | R-2 | spec | `812a0aa` | claude-opus-4.8 | procedural | 7 findings: 5 should-fix, 2 nits, none blocking |
| 2026-11-10 | R-3 | spec | `44aea8d` | unknown | procedural | 7 findings: 4 should-fix, 3 nits, none blocking; model identity not attested |
| 2026-11-10 | R-4 | spec | `5528322` | unknown | procedural | 7 findings: 5 should-fix, 2 nits, none blocking; model identity not attested |
| 2026-11-10 | R-5 | spec | `2198c88` | unknown | procedural | 4 findings: 2 should-fix, 2 nits, none blocking; model identity not attested |
| 2026-11-10 | R-6 | spec | `4cf4ae6` | unknown | procedural | 8 findings: 5 should-fix, 3 nits, none blocking; model identity not attested |
| 2026-11-10 | R-7 | spec | `b5612ad` | unknown | procedural | 3 findings: 2 should-fix, 1 nit, none blocking; model identity not attested |
| 2026-11-10 | R-8 | spec | `ec05a26` | unknown | procedural | 3 findings: 3 nits, none blocking; model identity not attested |
| 2026-11-10 | R-9 | spec | `c1a8587` | unknown | procedural | 3 findings: 1 should-fix, 2 nits, none blocking; model identity not attested |
| 2026-11-10 | R-10 | spec | `0c85c0b` | unknown | procedural | 4 findings: 2 should-fix, 2 nits, none blocking; model identity not attested |
| 2026-11-10 | R-11 | spec | `b0a2159` | unknown | procedural | 3 findings: 2 should-fix, 1 nit, none blocking; model identity not attested |
| 2026-11-10 | R-12 | spec | `12be951` | unknown | procedural | 4 findings: 1 should-fix, 3 nits, none blocking; model identity not attested |
| 2026-11-10 | R-13 | spec | `8286c54` | unknown | procedural | 3 findings: 1 should-fix, 2 nits, none blocking; model identity not attested |
| 2026-11-10 | R-14 | spec | `0aea08b` | unknown | procedural | 4 findings: 2 should-fix, 2 nits, none blocking; model identity not attested |
| 2026-11-10 | R-15 | spec | `27e821d` | unknown | procedural | 4 findings: 2 should-fix, 2 nits, none blocking; model identity not attested |
| 2026-11-10 | R-16 | spec | `73cf6b1` | unknown | procedural | 4 findings: 3 should-fix, 1 nit, none blocking; model identity not attested |
| 2026-11-10 | R-17 | spec | `0919a89` | unknown | procedural | 3 findings: 1 should-fix, 2 nits, none blocking; model identity not attested |
| 2026-11-10 | R-18 | spec | `d62f5b5` | unknown | procedural | 3 findings: 1 should-fix, 2 nits, none blocking; model identity not attested |
| 2026-11-10 | R-19 | spec | `2ea72bd` | unknown | procedural | 3 findings: 3 nits, none blocking; model identity not attested |
| 2026-11-10 | R-20 | spec | `8675000` | unknown | procedural | 3 findings: 2 should-fix, 1 nit, none blocking; model identity not attested |
| 2026-11-10 | R-21 | spec | `48bd339` | unknown | procedural | 2 findings: 2 should-fix, none blocking; model identity not attested |
| 2026-11-10 | R-22 | spec | `db12716` | unknown | procedural | 3 findings: 1 should-fix, 2 nits, none blocking; model identity not attested |
| 2026-11-10 | R-23 | spec | `dccdfb2` | unknown | procedural | 3 findings: 1 should-fix, 2 nits, none blocking; model identity not attested |
| 2026-11-10 | R-24 | spec | `9e3883b` | claude-opus-4.8 | procedural | 2 findings: 1 should-fix, 1 nit, none blocking |
| 2026-11-10 | R-25 | spec | `ef3ebb6` | unknown | procedural | 2 findings: 2 should-fix, none blocking; model identity not attested |
| 2026-11-10 | R-26 | spec | `fd18d71` | unknown | procedural | 3 findings: 2 should-fix, 1 nit, none blocking; model identity not attested |
| 2026-11-10 | R-27 | spec | `3eab6e7` | unknown | procedural | 3 findings: 1 should-fix, 2 nits, none blocking; model identity not attested |
| 2026-11-10 | R-28 | spec | `3b5e3d7` | unknown | procedural | 1 finding: 1 nit, none blocking; model identity not attested |
| 2026-11-10 | R-29 | spec | `cb5444a` | unknown | procedural | 1 finding: 1 should-fix, none blocking; model identity not attested |
| 2026-11-10 | R-30 | spec | `5ed12e1` | unknown | procedural | 1 finding: 1 should-fix, none blocking; model identity not attested |
| 2026-11-10 | R-31 | spec | `cfa455e` | unknown | procedural | 1 finding: 1 should-fix, none blocking; model identity not attested |
| 2026-11-10 | R-32 | spec | `202642a` | unknown | procedural | 3 findings: 2 should-fix, 1 nit, none blocking; model identity not attested |
| 2026-11-10 | R-33 | spec | `20498af` | unknown | procedural | 2 findings: 1 should-fix, 1 nit, none blocking; model identity not attested |
| 2026-11-10 | R-34 | spec | `07b95a5` | unknown | procedural | 4 findings: 1 should-fix, 3 nits, none blocking; model identity not attested |
| 2026-11-10 | R-35 | spec | `87c0032` | unknown | procedural | 2 findings: 1 should-fix, 1 nit, none blocking; model identity not attested |

### R-1

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Context (Background) and Design (Procedure changes)
EVIDENCE: docs/user-guides/workflows.md:143-146 reads "GitHub's automatic deletion of merged PR branches is the only setting that guarantees no merged branch stays behind on GitHub. vh-adlc checks it when it onboards a repository and in every maintenance sweep". The document says the guide calls merged-branch deletion "is the only setting" vh-adlc checks. The Design then plans to correct "the sentence that calls merged-branch deletion the only setting". That sentence makes a different claim, and the claim is accurate.
PROPOSAL: Fix the Background paraphrase so it quotes the sentence correctly. In the Design, either drop the planned correction or name the sentence that would actually become false, such as a claim that merged-branch deletion is the only setting vh-adlc changes.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design (states, availability rules) and AC-06
EVIDENCE: GitHub REST docs (/en/rest/repos/repos) say: "In order to see the security_and_analysis block for a repository you must have admin permissions". GET vulnerability-alerts and GET automated-security-fixes say: "The authenticated user must have admin read access to the repository." So a caller without admin cannot tell which settings are off. AC-06 still requires "lists every off and free setting as `not-changed` with reason `needs-admin`", and the state table has no state for a setting it could not read. A fake `gh` that answers those reads for `permissions.admin: false` would pass AC-06 even though the real API would not answer them.
PROPOSAL: Add a state or reason for a setting whose current value could not be read, for example `unknown` with `needs-admin`, and define how AC-06 and the exit code use it. Make the non-admin fixture deny the admin-only reads the way GitHub does.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Reads and writes) and Test Plan (AC-01, AC-03)
EVIDENCE: The document's own Sources entry says Dependabot security updates are "available where the dependency graph and alerts are enabled". The Design lists the endpoints but gives no order for the writes. It also does not say what happens to `dependabot_security_updates` when the alerts write fails. The AC-03 fixture is described only as a fake `gh` that "keeps settings state", so it would accept an `automated-security-fixes` write made while alerts are still off.
PROPOSAL: State that `vulnerability-alerts` is written and read back before `automated-security-fixes` is tried, and that security updates become `not-changed` when alerts are not on. Make the fake `gh` reject the security-updates write while alerts are off, and add a test for that case.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Renovate detection) and AC-02, AC-03
EVIDENCE: On michielvha/bg-remove the contents API returned 404 for every Renovate config location, and package.json has no renovate key. Even so, app/renovate has opened PRs #1 to #25, so the managed Renovate App runs there without a config file. knowledge/managed-renovate.md at 5b73d9e calls the managed App "the preferred updater for public and private repositories". Under Q3, a newly onboarded repository that the App covers but has not opened a PR in yet would count as "Renovate absent", get Dependabot security updates turned on, and never have them turned off. That is the duplicate PR problem the goal rules out. The opposite also fails: one old app/renovate PR keeps a repository marked as Renovate-present after it moves to Dependabot.
PROPOSAL: Add a positive signal for an installed Renovate App, such as an open Dependency Dashboard issue or an onboarding PR. Otherwise, when there is no history (for example at onboarding), report security updates as `left-off` with a distinct reason instead of enabling them. Take the residual risk to the owner as an open question.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design (states) and Scope (Out of scope)
EVIDENCE: Scope says that when Renovate is present and Dependabot security updates are already on, "The report shows that overlap through the detection evidence instead." The state table would list that entry as `already-on` ("Read as on before any write"), and the exit code is 0 because no entry is `not-changed`. The docs#30 convention says "Where Renovate owns an ecosystem, leave Dependabot version updates and Dependabot security updates off". With every criterion ticked, a repository that already has both bots stays the same and the report gives no warning, even though the goal is "without duplicating Renovate's pull requests".
PROPOSAL: Give this case its own reason, for example `already-on` with `renovate-overlap`, have the sweep report flag it as an owner decision, and add a criterion and a fixture for it.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Context (Owner summary) and Scope
EVIDENCE: conventions/repository-security.md at 5b73d9e says: "Code scanning, secret scanning and push protection need a paid licence on a private repository ... A maintenance or audit report lists these features as unavailable for the plan, not as findings to fix." The helper reports only secret scanning and push protection as `unavailable` there. Changing how the collector classifies a 403 or 404 is out of scope, and maintenance.md:79-80 says an unmatched 403/404 is incomplete. So a private repository's code scanning surface would stay incomplete instead of unavailable for the plan, which contradicts the summary's statement that "These rules match the repository security convention".
PROPOSAL: Either add a code scanning entry to the helper that reports `unavailable` with `not-free-on-private` on private and internal repositories and feeds the sweep's coverage, or name this gap explicitly as a known difference from the convention and have the owner accept it.

FINDING: F-07
KIND: judgement
SEVERITY: should-fix
WHERE: Context (Background) and AC-11
EVIDENCE: `gh pr view 30 -R vhco-pro/docs` reports state OPEN, mergedAt null, head 5b73d9e. The Background says the page "is not yet in the docs revision this repository pins (`a4e3d592`)". AC-11 requires `references/security-settings.md` to link to `conventions/repository-security.md`, but that page does not exist at the pinned revision or on vhco-pro/docs's default branch. The document names no precondition, link target or blocker for the case where docs#30 is still open, changes or is closed when implementation reaches AC-11.
PROPOSAL: State which link target AC-11 expects (a merged commit or the pinned revision after a pin bump) and make docs#30's merge an explicit dependency, or a blocker if it is still open at implementation time. Also say whether the pin bump is inside this feature's authority.

FINDING: F-08
KIND: judgement
SEVERITY: should-fix
WHERE: Design and Open Questions
EVIDENCE: The docs#30 onboarding checklist says "Confirm the security features match the repository's visibility, or that the owner chose otherwise", and its guide enables settings "With the owner's agreement". The Design runs `apply` in every sweep with no way to keep a setting off for one repository. Only a current request that forbids live changes skips the writes, and only for that run. A setting the owner deliberately turned off would be turned back on by every sweep. The document settles this trade-off without listing it, while the standard says every settled trade-off is an open question.
PROPOSAL: Add an open question on a persistent per-repository opt-out, for example a maintenance-settings entry that the helper reports as `left-off` with reason `owner-choice`, or record that the owner rejects having one.

FINDING: F-09
KIND: judgement
SEVERITY: nit
WHERE: Acceptance Criteria (AC-12) and Test Plan
EVIDENCE: On bg-remove, alerts are already on (GET vulnerability-alerts returned 204), and secret scanning and push protection are enabled. AC-12 therefore exercises only `already-on` and `left-off`. Nothing observes a real sweep enabling a disabled setting and then collecting that repository's alerts in the same run, which was the original failure. The ordering is checked only by reading the procedure text for AC-11.
PROPOSAL: Note this limit in the Test Plan or Owner summary so the owner accepts it knowingly, or add an owner-approved manual run against a scratch repository with alerts off.

FINDING: F-10
KIND: factual
SEVERITY: nit
WHERE: Context (Owner summary)
EVIDENCE: The summary says the authority table "today lets vh-adlc change one repository setting, and only after the owner says yes". references/authority.md:32 also allows it with "a request that already asks for it, or an approved plan digest that includes it".
PROPOSAL: Say that the setting is changed only with owner authorization: a yes, a request that asks for it, or an approved plan digest.

FINDING: F-11
KIND: factual
SEVERITY: nit
WHERE: Context (Background)
EVIDENCE: `gh pr list -R michielvha/bg-remove --author app/renovate --state all --json number,createdAt` gives #24 at 2026-11-10T07:14:56Z and #25 at 2026-11-10T07:15:04Z. The document says both were "opened at 07:14 UTC".
PROPOSAL: Write "opened at 07:14 and 07:15 UTC".

FINDING: F-12
KIND: judgement
SEVERITY: nit
WHERE: Acceptance Criteria (AC-05) and Test Plan
EVIDENCE: AC-05 says "Dependabot alerts are still enabled", but its fixture starts with every setting off, so "still" does not fit. The AC-05 pass condition only requires writes to `vulnerability-alerts` and `automated-security-fixes`. It never checks that the alerts entry is read back on and reported `enabled`.
PROPOSAL: Reword AC-05 to say `dependabot_alerts` is `enabled`. Add that read-back and state to the AC-05 pass condition for the private and internal fixtures.

### R-2

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design (Order of work, Procedure changes), AC-11, Test Plan (AC-11, AC-12) and covers
EVIDENCE: The plugin reads its conventions through its own pin. `plugins/vh-adlc/knowledge.md` says "The plugin reads its conventions from `vhco-pro/docs` at this revision: ...a4e3d592..." and "Moving this pin is a reviewed plugin change with a version bump". `references/loop.md:41-64` uses the repository's pin when there is one and the plugin pin otherwise. michielvha/bg-remove has no AGENTS.md, because `gh api repos/michielvha/bg-remove/contents/AGENTS.md` returned 404, so the AC-12 sweep there resolves conventions at the plugin pin. `vh-adlc knowledge --repo /tmp/vh-adlc-sec-20261110 --plugin-pin a4e3d592... --page conventions/repository-security.md` returned `missing-page`: "conventions/repository-security.md does not exist at vhco-pro/docs@a4e3d592...". The design moves only "this repository's `AGENTS.md`" pin. AC-11 checks the link only against "the docs revision `AGENTS.md` pins". `covers` lists neither `AGENTS.md`, `plugins/vh-adlc/knowledge.md` nor `plugins/vh-adlc/plugin.json`. If every box is ticked, `references/security-settings.md` still points consumers such as bg-remove at a revision without the page. If the maintenance skill adds the page to its `knowledge` request, those sweeps stop with `missing-page`.
PROPOSAL: Decide whether the plugin pin in `knowledge.md` moves with a version bump, and add that file, `plugin.json` and `AGENTS.md` to covers and Scope. State whether sweeps and onboarding request `conventions/repository-security.md` through `knowledge`, and how a consumer whose pin predates docs#30 behaves. Make AC-11 check the link at the revision the plugin actually uses.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Context (Owner summary, Owner decisions) and Sources
EVIDENCE: `conventions/repository-security.md` at 5b73d9e says "Where Renovate owns no ecosystem in the repository, turn on Dependabot security updates so each alert with an available patch gets a fix PR." The design leaves them off with `renovate-unknown` when there is no Renovate signal and no `dependabot.yml` (Design, detection table row "no signal | not configured"). The Owner summary still says "The rules follow the convention proposed in vhco-pro/docs#30". The Sources entry summarizes the convention as "repositories without Renovate turn them on" and names no difference. Order of work sends the document back to the owner only when docs#30 "changes the rules this design applies", which suggests the design already applies that rule. `references/security-settings.md` would then link to a convention whose updater rule it contradicts.
PROPOSAL: State in the Owner summary and the Design that the Q6 rule is stricter than the convention and why. Either have `references/security-settings.md` name that difference next to its link, or ask for docs#30 to adopt the positive-signal rule before it merges.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Context (Owner summary), Design (Rules applied before any write) and AC-15
EVIDENCE: The Owner summary says the keep-off list "keeps chosen settings off for good". The Design says a listed setting "is `left-off` with reason `owner-choice` and is never written", and the state table defines `left-off` as "Deliberately not enabled". Nothing says what happens when the listed setting is already on. bg-remove shows `secret_scanning` and `secret_scanning_push_protection` enabled (`gh api repos/michielvha/bg-remove --jq .security_and_analysis`), and GitHub enables these by default on public repositories. A keep-off row for push protection there would report `left-off` while the setting stays on, because the helper never turns anything off. The owner's chosen setting is not off, and the report says it is.
PROPOSAL: Define the state for a keep-off setting that reads as on, for example `already-on` with reason `owner-choice-conflict`, and send it to the owner decisions the way `renovate-overlap` is. Reword the summary so it says the list stops the helper from enabling a setting and does not keep it off. Add a fixture for this case under AC-15.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Context (Owner summary) and AC-07
EVIDENCE: AC-07 says "A second `apply` on the same repository makes no write call and lists every setting as `already-on`, `left-off` or `unavailable`", and the summary says "A second run changes nothing." The design's own rules contradict this in several cases. A non-admin repository lists every entry as `unknown` on every run (AC-06). After a failed write (AC-09, AC-13), the setting is still off and free, so a second `apply` writes it again. The Test Plan checks AC-07 only on the first fixture's resulting state. An implementation that follows AC-06, AC-09 and AC-13 cannot satisfy AC-07 as worded.
PROPOSAL: Limit AC-07 and the summary to a repository whose first `apply` left no entry `not-changed` or `unknown`, or say plainly that a second run retries failed writes.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design (states, Reads and writes)
EVIDENCE: The state table gives `unknown` only the reason `needs-admin`, and `not-changed` covers only a setting known to be "Off and free". No state covers an admin caller whose first read fails with a 5xx, a rate limit or a network error. The same gap applies when the `repos/{r}` read fails, when the `security_and_analysis` block is missing, or when the contents lookup for `dependabot.yml` fails. The Design also never says that `GET vulnerability-alerts` returning 404 means "off". The docs#30 onboarding guide says "The last command returns `204` when Dependabot alerts are on and `404` when they are off". So an implementation could just as well treat that 404 as an error. The fake `gh` is described only as one that "keeps settings state", so no test pins down either behaviour.
PROPOSAL: Define a state and reason for a failed read, for example `unknown` with `api-error` and the status, and its exit code. State that a 404 from `GET vulnerability-alerts` means off. Add a fixture where an admin read fails.

FINDING: F-06
KIND: judgement
SEVERITY: nit
WHERE: Design (Rules applied before any write) and AC-06
EVIDENCE: The rules give no order of precedence when more than one applies. A non-admin caller on an archived repository could get `unknown` (`needs-admin`) or `unavailable` (`archived`). A private archived repository could get `not-free-on-private` or `archived`. A keep-off row could clash with `renovate-present`. Under `check`, Dependabot security updates on the first fixture could get `check-only`, which AC-06 requires for "every off and free setting", or `alerts-off`, because alerts are never written in `check` and "Security updates are tried only when alerts read back as on".
PROPOSAL: Add one line that sets the precedence of the rules and reasons, including which reason `check` gives security updates while alerts are off.

FINDING: F-07
KIND: judgement
SEVERITY: nit
WHERE: Design (Helper) and AC-10, AC-14
EVIDENCE: The Helper section says `--format markdown` prints "a `## Repository security settings` section with one table row per entry", and AC-10 requires the Markdown to match the JSON row for row. AC-14 also requires "the Markdown output lists them under owner decisions". The Design puts owner decisions in the maintenance skill ("Entries with `renovate-overlap` go to the report's owner decisions") and gives the helper's Markdown no owner-decisions part.
PROPOSAL: Describe the owner-decisions part of the helper's Markdown output in the Helper section, or move the AC-14 check to the sweep report.

### R-3

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Procedure changes), AC-11, AC-21, AC-22 and Test Plan (AC-21)
EVIDENCE: Background says that after the alerts write, `dependabot/alerts?state=open` "listed 47 alerts about 20 seconds later". In `plugins/vh-adlc/scripts/maintenance/collect.ts:88-90` and `:131`, a successful read is `complete` with the parsed count, so an empty 200 page right after the write is `complete` with count 0. The Design's safeguard is a single sentence: "When alerts were enabled in this run, the report says the alert list may still be filling." No criterion requires that sentence. AC-11 does not list it, and AC-22 checks only the table and the owner decisions. The AC-21 fixture returns the three alerts "only once alerts are on", with no delay, so it cannot observe the gap. With every box ticked, a sweep that turns on alerts can still report the Dependabot surface as complete with zero or a partial count and give no warning. That is close to the original coverage gap.
PROPOSAL: Add a criterion and a fixture with a delayed alert list for the "may still be filling" note, keyed to an `enabled` alerts entry in the helper JSON. Alternatively, raise an Open Question on whether a Dependabot surface whose alerts were enabled in the same run is recorded as incomplete instead of complete.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Helper, Rules applied before any write, Procedure changes) and AC-22
EVIDENCE: Rule 4 covers only "a read of a setting's own state". The first `repos/{r}` read decides archived, visibility and admin, and no rule says what happens when it fails. The helper is modelled on `autoDelete`, which throws on that failure (`plugins/vh-adlc/scripts/branches/branches.ts:277-278`). The sweep step says "run `apply` for each repository in scope ... then collect" and "saves each repository's JSON output". It does not say whether exit 1 or a run with no output stops the sweep, skips collection, or leaves that repository out of the report. AC-22 only separates "saved with `--security-settings` files" from "Without the option". In a multi-repository sweep, one failed helper run can therefore drop that repository from the section without any notice, and every criterion still passes.
PROPOSAL: Define the output for a failed `repos/{r}` read, for example every entry `unknown` with `api-error`. State that a helper failure or exit 1 never blocks collection. Require the report section to name every repository in scope and to show a row for any repository with no helper output. Add a criterion and a fixture for this.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Procedure changes, authority row), Context (Owner decisions, Q22) and Scope
EVIDENCE: Elsewhere the plugin requires a consumer's own adopted declaration, or a current request, before it makes a remote effect in that consumer. `plugins/vh-adlc/references/authority.md` requires "An adopted `Standing maintenance report publication` declaration" and an "adopted `Standing audit workflow authorization`", and `references/maintenance-settings.md:51-57` takes standing grants only from the consumer's committed default branch. The proposed guide at docs#30 head `4b2198d` (guides/onboard-a-repository.md:100-101) says "With the owner's agreement, turn on Dependabot alerts", meaning the target repository's owner. The design makes `apply` the default in every sweep and onboarding of any consumer, offers only a per-repository opt-out, and treats "the owner's acceptance of this feature" as that agreement. The convention it follows names only `michielvha` and `vhco-pro` (conventions/repository-security.md:10-13 at `4b2198d`). The plugin is distributed through `.claude-plugin/marketplace.json` and `.agents/plugins/marketplace.json`, so a consumer repository with a different owner gets security settings written on its first sweep after an upgrade, without that owner agreeing.
PROPOSAL: Raise an Open Question that sets the scope of the standing agreement: every consumer, only repositories under the accounts the convention names, or only consumers that adopt a declaration in `.vh-adlc/maintenance.yaml`. Have the authority row state the chosen limit.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Procedure changes) and AC-11
EVIDENCE: The design switches to `check` "when the current request forbids live or remote changes". The maintenance run records its request as typed flags: `ReportRequest = { authorized_sweep; read_only?; draft_only?; no_commit?; no_push?; no_filesystem?; ... }` (`plugins/vh-adlc/scripts/maintenance/authority.ts:13`). `references/maintenance.md:38-40` gives `read-only`, `draft-only`, `no-commit` and `no-push` different meanings, and says that "`no-push` can still permit an isolated local report commit". The document never says which of these flags count as forbidding a GitHub settings write. AC-11 only checks the text "or `check` under a restricting request". An implementation could therefore run `apply` during a `no-push` or `draft-only` sweep and still satisfy every criterion.
PROPOSAL: Name the recorded request flags that select `check`. Add a criterion with a test showing that a run recorded with each of those flags makes no write call.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Context (Background, Owner decisions Q22) and Sources
EVIDENCE: `gh pr view 30 -R vhco-pro/docs` returns state OPEN and headRefOid `4b2198d7...`, but Background says "vhco-pro/docs#30 (open, head `89d567a`)". Q22 says docs#30 names both Dependabot config file names "since `4b2198d`". The compare 89d567a...4b2198d shows that change in `guides/onboard-a-repository.md` from commit 106ecfb ("name both Dependabot config file names in onboarding"); 4b2198d only reflowed the sentence. Design (Procedure changes) and Q22 depend on that guide's "owner's agreement" sentence, but Sources lists only `conventions/repository-security.md`. The standard says "Sources lists every external page read, each with the claim it supports."
PROPOSAL: Update the head to `4b2198d`, credit the file-name change to `106ecfb`, and add a Sources entry for `guides/onboard-a-repository.md` at `4b2198d` with the claims the document takes from it.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Context (Background) and Design (Renovate and Dependabot detection)
EVIDENCE: Background cites "The configured bot authors default to `renovate` and `dependabot` (`plugins/vh-adlc/scripts/maintenance/settings.ts:109`)". The detection rules check only a hard-coded `app/renovate` for pull requests and the Dependency Dashboard issue, and never use `bot_authors`. A consumer that sets `bot_authors` for a Renovate under another login gets no Renovate signal from that bot's pull requests, so the citation suggests a link the design does not have.
PROPOSAL: Either say that detection ignores `bot_authors` and why, or derive the Renovate pull request and issue authors from the configured value. If the citation supports nothing, remove it.

FINDING: F-07
KIND: judgement
SEVERITY: nit
WHERE: Design (Order of work), AC-11 and Test Plan (AC-11, AC-20)
EVIDENCE: The design depends on "Sweeps and onboarding do not request the page through `vh-adlc knowledge`, so a consumer whose own older pin lacks it still sweeps normally". `references/loop.md:59-61` and `:75-76` say an operation stops on `missing-page`. `vh-adlc knowledge --page conventions/repository-security.md` at `a4e3d592` returned `missing-page` with exit 5. No criterion or Test Plan row checks that the maintenance skill's and onboarding's `knowledge` page lists leave this page out.
PROPOSAL: Add to AC-11 and its proof that the maintenance skill and the onboarding `knowledge` requests do not list `conventions/repository-security.md`, so a consumer pinned before docs#30 still sweeps.

### R-4

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Context (Owner summary, Owner decisions Q25), Scope, Design (Procedure changes) and AC-24
EVIDENCE: Q25 records the owner's decision as "settings are written only in consumers that adopt `security_settings: apply` in their committed settings, and every other consumer gets `check`". The Owner summary says it turns settings on "In a repository whose committed `.vh-adlc/maintenance.yaml` opts in", and checks "elsewhere". Scope says "with `apply` only where the consumer opted in". The Design mode function, the authority row and AC-24 add a second path: `apply` also applies when "the current request asks to apply". No recorded owner decision covers that path. It is also undefined. `ReportRequest` has no such field (`plugins/vh-adlc/scripts/maintenance/authority.ts:13`), and `parseReportRequest` fails on any unknown key with "invalid current request" (`authority.ts:116`). Onboarding runs inside spec, tasks, implement or ship (`plugins/vh-adlc/references/loop.md:66-73`). It has no recorded maintenance request, so it is unclear what `security-settings-mode` reads there.
PROPOSAL: Either drop the current-request path so the Design, authority row and AC-24 match Q25, or raise it as an Open Question and update the summary and Scope to match the answer. If the path stays, name the recorded request field and say what input `security-settings-mode` takes during onboarding.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Settings, Procedure changes) and AC-24, Test Plan (AC-24)
EVIDENCE: The Design says `security_settings` "is read only from the consumer's committed default branch" through the chain in `references/maintenance-settings.md:51-57`. The AC-24 proof only varies whether "settings adopt `apply`". It has no case where the working tree adopts `apply` but the committed default branch does not, or where `AGENTS.md` does not link the settings file. An implementation that reads the value through `loadSettings` from the working tree (`settings.ts:61-67`) would pass. Separately, `resolveStanding` checks committed settings against a fixed key list (`authority.ts:100`). That list lacks `security_settings` and `security_settings_keep_off` and returns `invalid` for any other key. A consumer that commits either key would therefore lose its standing report-publication grant. The list already lacks `security_policy`, which `settings.ts:69` accepts, so this regression has happened before. No criterion covers it.
PROPOSAL: Add AC-24 cases where the value is uncommitted, on an unmerged branch, or not linked from `AGENTS.md`, and expect `check` in each. Add a criterion and test that a consumer whose committed settings contain both new keys keeps an adopted publication grant.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design (Collector) and AC-21, Test Plan (AC-21), covers
EVIDENCE: The Design records the Dependabot surface "as incomplete with reason `alerts-enabled-this-run` and the count it read". `plugins/vh-adlc/scripts/maintenance/security-io.ts:43` throws "security inventory incomplete total must be null" for any surface that is not complete and has a non-null count. `references/maintenance.md:77-78` says "unknown totals are null". As designed, that repository's security reconciliation would fail. `security-io.ts` is not in `covers`, and the AC-21 proof checks only the collector output, never `security-reconcile`.
PROPOSAL: Record the incomplete surface with a null count and keep the alerts it read, or change `security-io.ts` and add it to covers. Extend AC-21 so the sweep's security reconciliation accepts the collected inventory.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Design (Collector, Procedure changes) and AC-11
EVIDENCE: `references/maintenance-settings.md:46-48` says "Only the exact declared surface/status and matching message receive `complete-unavailable`" and "A bare 403/404 is unknown". `references/maintenance.md:78` says "Only the configured exact status/literal-message/evidence match is complete-unavailable". The new collector rule makes a private admin repository's code scanning surface `complete-unavailable` without an expectation (AC-16). The Design plans to edit only `references/maintenance.md:80`. AC-11 lists `maintenance-settings.md` but does not require either page to state the `not-free-on-private` collector rule or `alerts-enabled-this-run`. Once every box is ticked, both pages would still contradict the collector.
PROPOSAL: Add both collector rules to the list of rules AC-11 requires, and name `maintenance-settings.md:46-48` and `maintenance.md:78-80` as text that changes.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Frontmatter (goal), plan introduction and Context (Owner summary)
EVIDENCE: The goal promises "each GitHub security setting its plan offers for free turned on", and the introduction says the same of "the GitHub security settings a repository's plan includes at no cost". On the public repository bg-remove, `gh api repos/michielvha/bg-remove/private-vulnerability-reporting` returned `{"enabled":false}`. That free setting is not in Scope. Code scanning default setup is also free on public repositories and is deliberately never enabled (Out of scope). With every criterion ticked, the AC-12 repository would still have free settings off.
PROPOSAL: Narrow the goal and introduction to the settings `conventions/repository-security.md` lists for the repository's visibility. Alternatively, raise private vulnerability reporting as an Open Question.

FINDING: F-06
KIND: judgement
SEVERITY: nit
WHERE: Design (Rules applied before any write, Renovate and Dependabot detection) and AC-19
EVIDENCE: Each entry takes "the state and reason of the first rule below that applies to it". Rule 6 ("Renovate and Dependabot rules ... for `dependabot_security_updates`") applies to that entry in every case. Its "no signal | configured | When off" cell is "written, then `enabled`", which is an action, not a final state. Read strictly, rules 8 to 10 (`check-only`, `alerts-off`, `api-error` on write) would never decide security updates. Only the wording of rule 8 implies otherwise. AC-19 tests "the first that applies".
PROPOSAL: Say that rule 6 decides the entry only for the rows that do not write, and that the writing row falls through to rules 7 to 10.

FINDING: F-07
KIND: judgement
SEVERITY: nit
WHERE: AC-23 and Test Plan (AC-23)
EVIDENCE: AC-23 requires that "In a sweep, a helper failure or exit 1 for one repository does not stop collection for any repository". The sweep runs the helper through the maintenance skill's agent procedure. No maintenance script runs the helper. So the proof, `bun test tests/vh-adlc/maintenance` with "a two-repository sweep fixture where the helper exits 1 for the first", can only run `collect` on prepared files. It would pass whatever the skill text says.
PROPOSAL: Add a check that the maintenance skill step says a helper failure never blocks collection. Alternatively, reword the bun test's pass condition so it claims only the collector behaviour it observes.

### R-5

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design (Procedure changes), AC-24 and Test Plan (AC-24)
EVIDENCE: `plugins/vh-adlc/scripts/maintenance/cli.ts:66-67`: `start` returns `{ persisted: false, mode: "chat-only", reason: "current request forbids filesystem writes" }` when `request.no_filesystem === true` and creates no run. `plugins/vh-adlc/references/maintenance.md:39-41` says "If all filesystem writes are forbidden, return chat-only findings with no journal". This means a `no_filesystem` sweep never has a recorded request. AC-24 says `security-settings-mode` prints `apply` "also with no recorded request", so a consumer that adopts `security_settings: apply` gets `apply` in a `no_filesystem` sweep, which contradicts Q26. The skill step "run the helper in that mode, save its JSON, then collect with those files" is also a filesystem write that `no_filesystem` forbids. The AC-24 proof's "request with ... `no_filesystem`" case cannot arise from a real recorded run.
PROPOSAL: Have `security-settings-mode` take the current request directly, or have the skill select `check` without calling it when the current request forbids filesystem writes. Under `no_filesystem`, say that the helper's output stays in chat with no saved JSON. Add an AC-24 case for a `no_filesystem` sweep that has no recorded run.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Settings, Procedure changes), AC-11 and covers
EVIDENCE: `plugins/vh-adlc/scripts/maintenance/settings.ts:12-14` fails with "settings contains unsupported fields" for any unlisted key, and `loadSettings` runs before every maintenance CLI operation (`cli.ts:57`). The precedent for `security_policy` is `references/maintenance-settings.md:97`, which says "Older readers reject this new key: follow the documented rollback preflight before dependent use." `docs/reference/compatibility.md:96-97` says "older helpers reject a newly adopted `security_policy` key and require the documented settings rollback handoff". The document adds `security_settings` and `security_settings_keep_off` with a minor version bump. Neither the Design nor AC-11 requires that note, and `docs/reference/compatibility.md` is not in `covers`. A consumer that adopts either key breaks every maintenance command on a host still running an older plugin.
PROPOSAL: Require the older-reader note for both keys in `references/maintenance-settings.md` and `docs/reference/compatibility.md`, naming the new plugin version as the minimum. Add `docs/reference/compatibility.md` to `covers` and to AC-11.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Design (Order of work)
EVIDENCE: The document says "Both move to the revision where docs#30 merged ... so every consumer resolves the page", then says "a consumer whose own older pin lacks it still sweeps normally". `plugins/vh-adlc/knowledge.md:7-9` says `vh-adlc knowledge` decides whether the repository's own pin or the plugin pin applies. I ran `vh-adlc knowledge --repo /tmp/vh-adlc-sec-20261110 --plugin-pin a4e3d592e2ebb17295e0adf37747878f0c207b93 --page conventions/repository-security.md`, which resolved through the repository pin (`AGENTS.md`) and returned `missing-page`. A consumer whose own pin predates the merge does not resolve the page.
PROPOSAL: Say that consumers without their own pin, or with a pin at or after the docs#30 merge, resolve the page.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Design (Rules applied before any write, rules 5, 6 and 9) and AC-07
EVIDENCE: Rule 5 makes a keep-off `dependabot_alerts` entry `left-off` with `owner-choice` and never writes it. For `dependabot_security_updates` in the "no signal | configured | When off" row, rule 6 falls through, and rule 9 then gives `not-changed` with `alerts-off`. The exit code is 1 whenever any entry is `not-changed`. So a Dependabot repository whose owner keeps alerts off shows a `not-changed` row and exits 1 in every `apply` run because of a recorded owner choice. AC-07's clean first run can never happen there.
PROPOSAL: When the keep-off list names `dependabot_alerts`, make security updates `left-off` with `owner-choice` or another named reason. Otherwise, state that the permanent exit 1 is intended.

### R-6

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design (Procedure changes) and AC-11
EVIDENCE: `plugins/vh-adlc/references/maintenance.md:218-219` at 4cf4ae6 reads "Report helpers never push, merge shared main or mutate GitHub. The one exception is the branch helper's `apply` and `after-merge`, which delete branches and may enable automatic branch deletion". `maintenance.md:55` reads "Record operation intent before committing or mutating remotely, then observed receipt." The design has every sweep run the security-settings helper in `apply`, which writes GitHub settings inside a recorded run. The Design lists no change to either sentence, and the run journal records no intent or receipt for those writes. AC-11 lists what `references/maintenance.md` must state, but it does not require the "one exception" sentence to change. So once every box is ticked, the page can still say the branch helper is the only helper that mutates GitHub, and its journal rule stays unmet or unaddressed.
PROPOSAL: Add the security-settings helper to the exception sentence in `references/maintenance.md`. State how its `apply` writes satisfy the intent-then-receipt journal rule, for example by recording intent before the helper runs and its saved JSON as the receipt, or state that they are exempt. Add both points to AC-11.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Context (Owner summary), goal frontmatter
EVIDENCE: The Owner summary says "In a repository whose committed `.vh-adlc/maintenance.yaml` opts in with `security_settings: apply`, it turns these on when off". The goal says "Every maintenance sweep and onboarding of an opted-in repository". The Design has the skill run the helper "for each repository in scope" in the mode `security-settings-mode` prints. That mode comes from the consumer's committed settings. The authority row allows `apply` "on a repository in its scope only when the consumer's committed settings adopt `security_settings: apply`". So one consumer's opt-in also writes settings on every related repository in `repositories`, and those repositories never opt in themselves. The summary reads as if each repository opts in for itself.
PROPOSAL: Say in the Owner summary and the goal that the sweeping consumer's committed opt-in applies the settings to every repository in that sweep's scope, and that the keep-off list is how one of them is excluded.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria (AC-07), Design (state table, exit code) and Test Plan (AC-07)
EVIDENCE: AC-07 says "After an `apply` that left no entry `not-changed` or `unknown`, a second `apply` on the same repository makes no write call". A failed Renovate or Dependabot detection lookup gives `left-off` with `renovate-detection-failed` or `dependabot-detection-failed` (AC-08). It is neither `not-changed` nor `unknown`, so the first run exits 0 and counts as clean. If the lookups succeed on the second run and find no Renovate signal and a `.github/dependabot.yml`, the "no signal | configured | When off" row writes `automated-security-fixes`, which contradicts AC-07. The AC-07 proof uses only the first fixture, so it never exercises this case.
PROPOSAL: Exclude the two detection-failed reasons from AC-07's clean-first-run condition, or count them toward exit 1. Add an AC-07 fixture whose first run has a failed detection lookup.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Rules applied before any write, rule 5) and Acceptance Criteria (AC-15, AC-19)
EVIDENCE: GitHub's "Enabling push protection for your repository" page (docs.github.com, read 2026-11-10) says: "4. If you have not already enabled Secret Protection, to the right of 'Secret Protection', click Enable. 5. ... to the right of 'Push protection', click Enable." So push protection depends on secret scanning. Rule 5 handles that kind of dependency only for `dependabot_alerts` and security updates (Q32). A keep-off row that names `secret_scanning` but not `secret_scanning_push_protection` makes `apply` PATCH push protection alone while secret scanning is off. The document does not say what happens then. It could be a permanent `not-changed` with exit 1 in every run, as R-5 F-04 found for alerts, or GitHub could turn on the kept-off secret scanning. No criterion or fixture covers this case.
PROPOSAL: Extend rule 5 so a keep-off row for `secret_scanning` also leaves push protection `left-off` with `owner-choice` when it is off, the same way Q32 handles alerts. Add a fixture to AC-19.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Collector, Procedure changes) and Acceptance Criteria (AC-21, AC-22, AC-23)
EVIDENCE: `collect` and `report` gain a repeatable `--security-settings FILE` that takes "the helper's JSON". The skill says "A helper failure or exit 1 never blocks collection". The document does not say what either command does with a file that is empty, malformed, truncated after a helper crash, names a repository outside the sweep's scope, repeats a repository, or comes from an earlier run. Nothing binds the file to the current run or records where the skill saves it. The maintenance helpers otherwise fail visibly on bad input (`settings.ts:12-14`, `cli.ts:50-52`). So a bad file either makes `collect` fail, which would block collection, or is accepted silently. A stale file that lists `dependabot_alerts` as `enabled` would mark a complete surface `alerts-enabled-this-run`.
PROPOSAL: Specify validation for both inputs: the expected repository in scope, one file per repository, a schema check, and binding to the current run. Say whether an invalid file fails the command or is reported as "helper did not run". Say which files the skill passes after a helper failure, and add one fixture to AC-23.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Context (Background, owner decisions)
EVIDENCE: The Q22 bullet still says "the owner's acceptance of this feature is the standing agreement the onboarding guide asks for". Q25 and the Design's authority row now say "That adoption [of `security_settings: apply`] is the owner's agreement that `guides/onboard-a-repository.md` ... asks for". The Q25 bullet says it "narrows Q3 and the sweep default" but does not say it replaces Q22.
PROPOSAL: Add to the Q25 bullet, or to Q22, that adopting `security_settings: apply` replaced feature acceptance as the agreement the onboarding guide asks for.

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: Context (Background)
EVIDENCE: The Background says merged-branch deletion is written "only with the owner's yes" and cites `plugins/vh-adlc/references/authority.md:32`. That row reads "The owner's yes to enabling it for that repository with `auto-delete --enable`, a request that already asks for it, or an approved plan digest that includes it". R-1 F-10 corrected the same wording in the Owner summary but not here.
PROPOSAL: Write "only with the owner's authorization: a yes, a request that asks for it, or an approved plan digest".

FINDING: F-08
KIND: judgement
SEVERITY: nit
WHERE: Design (Reads and writes, state table)
EVIDENCE: The REST description defines `check-automated-security-fixes` with a required `paused` boolean, "Whether Dependabot security updates are paused for the repository". The design reads only `enabled`, so `{"enabled":true,"paused":true}` is reported as `already-on` with exit 0. In a Dependabot-only repository no fix pull requests are then opened, and the sweep report gives no sign of it.
PROPOSAL: Show `paused` in the security-updates entry, for example as an `already-on` reason, or record that paused is treated as on.

### R-7

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design (state table, Reads and writes, Rules applied before any write), AC-19 and Test Plan
EVIDENCE: The state table says `already-on` takes "`paused` when security updates read `paused` true", and Reads and writes says the `paused` boolean "when true on an entry read as on, gives reason `paused`". The precedence section says "each entry takes the state and reason of the first rule below that applies to it", and none of rules 1 to 10 assigns `paused`. Rule 6 decides every "When on" cell of the Renovate and Dependabot table, because only the "no signal, configured, off" row falls through. Those cells give `already-on` with no reason, or `renovate-overlap`. Rule 5 gives `owner-choice-conflict`. Under the numbered rules, which AC-19 makes binding, `paused` is therefore never produced. The document also does not say which reason wins when an entry is paused and also has `renovate-overlap` or `owner-choice-conflict`. No criterion states that paused security updates are `already-on` with `paused`. No fixture returns `{"enabled":true,"paused":true}`: the only `automated-security-fixes` 200 fixture is AC-18's `{"enabled":false,"paused":false}`. AC-10 and AC-22 list `paused` in the owner decisions but use only `renovate-overlap` fixtures. So with every box ticked, Q36 can be left unimplemented.
PROPOSAL: Put `paused` into the numbered rules, for example inside rule 6's "When on" cells and rule 7, and state its order against `renovate-overlap` and `owner-choice-conflict`. Add a criterion and a fixture with `paused` true that expects `already-on` with `paused`, no write, exit 0, and an entry in the Markdown owner decisions list.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Procedure changes, authority row), Context (Owner summary) and AC-24
EVIDENCE: The Owner summary says that "elsewhere, or under a restricting request, it only checks", and the authority row says "A request with a flag that selects `check` wins". The Design says "Onboarding has no recorded maintenance request, so it runs the command without one and the committed settings alone decide". AC-24 says it "prints `apply`, also with no recorded request". The maintenance-only `no_filesystem` path (R-5 F-01) is handled only in the maintenance skill. Nothing in `references/loop.md`, `references/lifecycle.md` or the onboarding text turns a read-only, draft-only or no-change onboarding request into `check`. In a consumer that has already committed `security_settings: apply`, for example during a re-onboarding, a restricted onboarding request still writes GitHub settings.
PROPOSAL: State that onboarding selects `check` without calling `security-settings-mode` when its current request forbids repository changes, as the skill does for `no_filesystem`. Add that rule to the onboarding text in AC-11, or add an AC-24 case for it.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Context (Owner summary)
EVIDENCE: The summary says "Its owner decisions list names Dependabot security updates left on beside Renovate, and keep-off settings found on." Q36, the Helper section and AC-10 and AC-22 also send entries with reason `paused` to that list. The summary does not mention paused security updates.
PROPOSAL: Add paused Dependabot security updates to the summary's description of the owner decisions list.

### R-8

FINDING: F-01
KIND: judgement
SEVERITY: nit
WHERE: Design (Helper exit code, Renovate and Dependabot detection table) and Context (Background, Q33 bullet)
EVIDENCE: The Background says "a failed detection makes the helper exit 1 (Q33)". The Design sets exit 1 only when an entry is `not-changed` or `unknown`, or has reason `renovate-detection-failed` or `dependabot-detection-failed`. Those two reasons appear only in the "When off" column. The "a lookup failed, no match | any" row gives `already-on` with no reason in its "When on" cell. So when security updates are already on and a Renovate lookup fails, the helper exits 0. If Renovate is in fact present, no `renovate-overlap` entry reaches the owner decisions list for that sweep. The same happens when a keep-off row decides the entry.
PROPOSAL: Either reword the Q33 bullet to say that only an entry with a detection-failed reason makes the helper exit 1, or give the "When on" cell of the failed-lookup row its own reason and exit 1. If you take the second option, place that reason in the Q37 order.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Design (Rules applied before any write)
EVIDENCE: The new paragraph "An entry has one reason. Security updates read as on with `paused` true take reason `paused` ..." sits at column 0 between item "7. Already on" and item "8. Check mode". That ends the first ordered list, and "8." then starts a second list. AC-19 refers to "the numbered order under 'Rules applied before any write'", and that order is now split around a paragraph that changes how rules 6 and 7 assign reasons.
PROPOSAL: Indent the paragraph under rule 7, or move it after rule 10 so that rules 1 to 10 stay one list.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Test Plan (AC-22)
EVIDENCE: AC-22 requires an "Owner decisions" list across all files that holds "exactly the entries with `renovate-overlap`, `owner-choice-conflict` or `paused`". The AC-22 proof renders a report with only one `renovate-overlap` entry. AC-17 and AC-26 check `owner-choice-conflict` and `paused` only in the helper's own Markdown. The report's cross-repository list is a separate aggregation in `renderReport`. If that aggregation filtered out `paused` or `owner-choice-conflict`, AC-22 would still pass.
PROPOSAL: Add a `paused` entry and an `owner-choice-conflict` entry to the AC-22 fixture files, placed in different repositories, and expect all three entries in the report's owner decisions list.

### R-9

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Procedure changes, mode function and maintenance skill step) and AC-24
EVIDENCE: The recorded request type is `ReportRequest = { authorized_sweep: boolean; read_only?; draft_only?; no_commit?; no_push?; no_filesystem?; ... }` (`plugins/vh-adlc/scripts/maintenance/authority.ts:13`). The standing publication grant applies only when `request.authorized_sweep` is true (`authority.ts:126`), and `tests/vh-adlc/maintenance/publication.test.ts:110` checks that `{ authorized_sweep: false }` gives no commit and no push. The document's mode is `check` only for `read_only`, `draft_only`, `no_push` or `no_filesystem`, or when the settings do not adopt `apply`. "Otherwise it is `apply`." The skill step runs the helper "before collection" for "each repository in scope". The skill also covers PR assessment, "selected repair or continuation" (`plugins/vh-adlc/skills/vh-adlc-maintenance/SKILL.md:22`), and `collect` takes a single `--pull` scope (`plugins/vh-adlc/scripts/maintenance/cli.ts:62-64`). The goal and the authority row grant writes to a "maintenance sweep". As written, a recorded request with `authorized_sweep: false`, or a PR-scoped assessment or continuation in an opted-in consumer, gets `apply` and writes GitHub settings. AC-24 has no case for either.
PROPOSAL: Make the mode `check` unless the recorded request has `authorized_sweep` true. Say whether the helper runs, or runs only under `check`, for a PR-scoped collection or a continuation. Add an AC-24 case for `{ "authorized_sweep": false }` with settings that adopt `apply`.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: Design (state table, rule 10) and Test Plan (AC-09)
EVIDENCE: Rule 10 says "a write that fails, or a setting not read back as on, is `not-changed` with the status". The state table gives `not-changed` the reason "`api-error` with the HTTP status". When a write succeeds, for example `PUT automated-security-fixes` 204 or `PATCH repos/{r}` 200, but the read-back still shows the setting off, no HTTP call failed. The document does not say which status or detail that entry carries. The only fixture is AC-09's `PATCH` 422, so no test covers a successful write that does not take effect.
PROPOSAL: Give the read-back case its own detail, for example `api-error` with the write status and "not on after write", or a separate reason. Add a fixture where the write succeeds but the read-back shows the setting off.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: AC-21 and Context (Owner summary)
EVIDENCE: AC-21 requires that "the sweep's security reconciliation accepts that inventory", and the summary says alerts enabled during a sweep "count as incomplete until the next one". The reconciler adds a gap `coverage handoff pending` for each incomplete coverage row without a tracked handoff (`plugins/vh-adlc/scripts/maintenance/security.ts:143`, `tracked` at `:117`). `plugins/vh-adlc/references/maintenance.md:327` says "`reconciled` requires ... an explicit handoff for coverage gaps". So each sweep that enables alerts leaves accounting pending unless the agent records a handoff. The document never names that handoff or the expected reconciliation result, so "accepts" in AC-21 is not stated as an observable result.
PROPOSAL: State the expected `security-reconcile` result for an `alerts-enabled-this-run` surface: pending with that coverage gap, or reconciled when a handoff names the next sweep. Have AC-21's proof check that result.

### R-10

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Settings, Helper, Procedure changes) and AC-15, AC-24
EVIDENCE: The Design says `security_settings` "is read only from the consumer's committed default branch" (`plugin.../maintenance-settings.md:51-57` says "A declaration in task data, an uncommitted edit or an unmerged branch is unadopted"). The keep-off list and the write scope do not follow the same rule. `security_settings_keep_off` is added to `scripts/maintenance/settings.ts`. Its `loadSettings` (`settings.ts:61-75`) reads the checkout's working-tree `.vh-adlc/maintenance.yaml`, or any `--settings` path. The helper's `--repo` "is the checkout whose `.vh-adlc/maintenance.yaml` applies", and the sweep's repositories come from the same working-tree `repositories` field (`cli.ts:68`). In an opted-in consumer, an uncommitted deletion of a committed keep-off row lets `apply` enable a setting the owner chose to keep off. An uncommitted `repositories` row also makes a repository the committed settings never named a write target. No criterion or fixture covers either case. The AC-15 fixture does not say whether its keep-off row is committed.
PROPOSAL: Say where `apply` reads its keep-off rows and target scope. Either read them from the same committed, linked settings as the opt-in, or select `check` when the working tree's keep-off or repository scope widens the committed values. Add AC-24 or AC-15 fixtures for an uncommitted keep-off removal and an uncommitted added repository.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Procedure changes), AC-11, AC-21 and Test Plan (AC-11, AC-21)
EVIDENCE: The Q41 fold adds three rules: "The helper runs once, before a new run's collection; a continuation reuses that run's saved files and does not run it again", "a PR-scoped assessment checks", and "only a full authorized sweep writes". AC-11 lists the statements the reference pages and skill must carry, and none of these three is among them. The authority row in the Design still says only that "A request with a flag that selects `check` wins", and a pull request scope is not a flag. AC-21 is a composite that includes "the maintenance skill records one naming the next sweep". Its only proof is a `bun test tests/vh-adlc/maintenance` fixture that runs `security-reconcile` with and without a handoff. A Bun test cannot observe what the skill text instructs, so an implementation review would find that part of AC-21 untested.
PROPOSAL: Add to AC-11, and to its reviewer read, that the maintenance skill and `references/security-settings.md` state the authorized-sweep and pull-request-scope rules and the once-per-run continuation rule, and that the authority row names them. Add the skill's coverage-handoff instruction to AC-11, or add a reviewer read of the skill step to the AC-21 proof.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Design (Rules applied before any write, rule 2, and the state table)
EVIDENCE: Rule 2 (`not-free-on-private`) makes private secret scanning and push protection "`unavailable` unless the admin read shows them on, which makes them `already-on`". The rules say each entry "takes the state and reason of the first rule below that applies". So such an entry would carry `already-on` with `not-free-on-private`. The state table lists only `renovate-overlap`, `owner-choice-conflict` and `paused` as reasons for `already-on`. Because rule 2 comes before rule 5, a keep-off row for a paid setting found on in a private repository never gives `owner-choice-conflict` and never reaches the owner decisions list. Q14 says that "a keep-off setting found on is `already-on` with `owner-choice-conflict`".
PROPOSAL: State the reason, or say there is none, for a private entry that rule 2 finds on. Also say whether a keep-off row for that entry still gives `owner-choice-conflict`, or record that rule 2 deliberately overrides Q14 for paid settings.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Context (Owner summary)
EVIDENCE: The summary says the helper turns settings on when the committed settings opt in, and that "elsewhere, or under a restricting request, it only checks". It does not mention the Q41 limits: a recorded request without `authorized_sweep` true checks, a PR-scoped run checks, and a continuation does not run the helper again. A pull request scope is not a restricting request. The summary also says "Reviews R-1 to R-9 found nothing blocking, and the owner answered their questions". The Q41 to Q43 bullet says these R-9 decisions were "taken with the reviewer's proposal under that instruction" and were not put to the owner as questions.
PROPOSAL: Add one sentence to the summary saying that only a full authorized sweep or onboarding may apply, and that PR-scoped runs only check. Say that the R-9 findings were folded under the owner's standing instruction.

### R-11

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Settings, Procedure changes: mode function and maintenance skill step, Helper CLI) and AC-24
EVIDENCE: Design (Settings) says "Under `apply`, the keep-off rows and the list of repositories the sweep may write to are read from the same committed, linked settings" and "A repository in the working tree's scope that the committed settings do not name gets `check`". The AC-24 proof expects `check` for that repository from `bun test tests/vh-adlc/maintenance` ("the working tree adds a repository to `repositories` (pass: `check` for that repository)"). The only mode interface defined is a `security-settings-mode` command that "takes an optional `--run-id` and prints the mode with its reason". It has no repository argument and returns one mode per run. The skill step then runs the helper for "each repository in scope ... in that mode". No text says which component downgrades one repository to `check`, or what the helper output shows when that happens. The committed read also lacks an input. `resolveStanding` takes `{ default_branch, default_commit }` and fails unless `refs/remotes/origin/<branch>` equals that commit (`plugins/vh-adlc/scripts/maintenance/authority.ts:88-92`). The `report` command supplies these through `--default-commit` and the inventory's observed default branch (`plugins/vh-adlc/scripts/maintenance/cli.ts:93-96`). `security-settings-mode` runs before collection and has neither. The helper's `apply`, which must read committed keep-off rows, has no such flag. The run scope always includes the origin repository (`cli.ts:68`), and the optional `repository` key does not name it. The document does not say whether that repository counts as named by the committed settings.
PROPOSAL: Define the interface. For example, `security-settings-mode` could take `--repository` (or print one mode per repository in the run's scope) plus `--default-branch` and `--default-commit`, with the helper's `apply` taking the same committed binding for its keep-off rows. Say that the origin repository always counts as named, and state the output for a repository downgraded to `check`.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Procedure changes: onboarding and authority row) and AC-11
EVIDENCE: Onboarding is the step whose first change "adds the pinned `AGENTS.md`" when `knowledge` reports source `plugin` (`plugins/vh-adlc/references/loop.md:63-69`). In the usual case, the committed default branch therefore has no `AGENTS.md` link to `.vh-adlc/maintenance.yaml` yet, and `resolveStanding` returns unadopted (`authority.ts:95-96`). The design's onboarding then runs the helper under `check` and "reports its output". After the pin move, the guide that onboarding reads and applies "within the selected task's authority" (`plugins/vh-adlc/references/lifecycle.md:64`) says "With the owner's agreement, turn on Dependabot alerts in every repository" and gives the `gh api -X PUT` and `PATCH` commands. Its checklist item 6 requires "Confirm the security features match the repository's visibility, or that the owner chose otherwise" (`/tmp/vhco-docs-30/guides/onboard-a-repository.md` at `4b2198d`). The design says only that adopting `security_settings: apply` is that agreement. It does not say whether, under `check`, onboarding may run the guide's commands or the helper's `apply` on an in-session yes, as it does for merged-branch deletion (`loop.md:70-73`). It also does not say how checklist item 6 is recorded when the owner neither adopts the setting nor declines. AC-11 does not require loop.md or lifecycle.md to state either point.
PROPOSAL: State in the Design and AC-11 what onboarding does under `check`. One option is to report the states, say how to opt in, record item 6 as pending the owner's choice, and never run the guide's manual commands. Note in the Owner summary that onboarding usually checks, because the onboarding commit is what links the settings.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Design (Rules applied before any write, rule 2 and the closing paragraph)
EVIDENCE: Rule 2 makes private secret scanning and push protection "`unavailable` unless the admin read shows them on", and it comes before rule 3 (`needs-admin`). For a private repository read without admin, no admin read exists, and AC-19's proof expects "secret scanning and push protection `unavailable` with `not-free-on-private`" there. GitHub returns `security_and_analysis` only to admins, so the helper did not see whether those features are on. The closing paragraph still says "Rules 1 to 4 need no reading of the setting, or report that the read failed, so no entry claims a state the helper could not see." For `code_scanning`, rule 2 requires admin evidence (Q19), so the two paid features are treated differently.
PROPOSAL: Reword the closing sentence so it says that rule 2 infers `unavailable` from visibility alone when no admin read exists. Alternatively, make non-admin private secret scanning entries `unknown` with `needs-admin`, as `code_scanning` is.

### R-12

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Collector, Procedure changes: maintenance skill step) and AC-21, AC-23
EVIDENCE: The `alerts-enabled-this-run` rule depends on the helper's saved JSON reaching `collect`. Design: "When a file lists `dependabot_alerts` as `enabled` for a repository, the collector records that repository's Dependabot surface as incomplete". Any file that is missing, malformed or truncated "is ignored for collection and shown in the report as 'helper did not run'", and "A helper failure or exit 1 never blocks collection". Background: on bg-remove, `GET dependabot/alerts` listed 47 alerts "about 20 seconds later" after the PUT. Suppose `apply` succeeds on `PUT vulnerability-alerts` and then the helper crashes, or its stdout is not saved as valid JSON. The collector then reads the now-enabled alerts endpoint and gets an empty or partial list. Through `alertSurface` (`plugins/vh-adlc/scripts/maintenance/collect.ts:108-115`), it records the surface `complete` with that count, and `security-reconcile` raises no coverage gap for a complete surface (`plugins/vh-adlc/scripts/maintenance/security.ts:143`). R-6 F-05 and Q35 decided how a bad file is shown. They did not decide the coverage of a surface whose write may have happened without a receipt. AC-23 checks only that a bad file "changes no surface".
PROPOSAL: When the run's mode for a repository was `apply` and no valid helper file exists for it, have `collect` record that repository's Dependabot surface as incomplete, for example with reason `helper-receipt-missing`, or have the skill pass the mode to `collect`. Add an AC-23 fixture where the alerts write happened and the helper file is missing.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: Design (Helper, Settings, Procedure changes: mode function) and AC-24
EVIDENCE: The Design reads the opt-in and keep-off rows "bound as `resolveStanding` binds them (`plugins/vh-adlc/scripts/maintenance/authority.ts:88-92`)" and "Like the other standing grants" (`plugins/vh-adlc/references/maintenance-settings.md:51-57`). That page defines the chain as "`AGENTS.md` links to `.vh-adlc/maintenance.yaml`; its `project_procedure` names the declaration file". `resolveStanding` returns `unadopted` at `authority.ts:103` (`if (settings.project_procedure === undefined) return result;`) before it reads any other key. If the mode function reuses the Standing status, a consumer that commits `security_settings: apply` but has no publication declaration always gets `check`. The AC-24 fixtures do not say whether `project_procedure` is present.
PROPOSAL: State that the opt-in needs only the committed `AGENTS.md` link to a valid committed `.vh-adlc/maintenance.yaml`, with no `project_procedure` or publication declaration. Add an AC-24 fixture that adopts `apply` without `project_procedure`.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Design (Procedure changes) and AC-11
EVIDENCE: `plugins/vh-adlc/references/maintenance-settings.md:103-123` has the operations table ("| Operation | Inputs and result |"), with one row per maintenance CLI operation and its flags, for example "`collect` | Optional `--repository`, `--pull`, `--terminal`" and "`report` | `--run-id --inventory --default-commit`, ...". The Design adds a `security-settings-mode` operation, `--security-settings` and `--run-id` to `collect`, and `--security-settings` to `report`. Neither the Design nor AC-11 says that this table gains the new row and flags. AC-11 lists only the policy statements that `references/maintenance-settings.md` must carry.
PROPOSAL: Add to the Procedure changes and to AC-11 that the operations table in `references/maintenance-settings.md` lists `security-settings-mode` with its flags, and the new `collect` and `report` flags.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Context (Owner summary)
EVIDENCE: The summary says that, with the committed opt-in, "it turns these on when off in every repository the sweep covers, except what the keep-off list names." The run's scope comes from the working tree's `repositories` (`plugins/vh-adlc/scripts/maintenance/cli.ts:68`). The Design (Settings, Q48) says "A repository in the working tree's scope that the committed settings do not name gets `check`", with reason `not-in-committed-scope`. The summary leaves out that limit.
PROPOSAL: Reword the sentence to say it turns them on in every repository the sweep covers that the committed settings name, apart from the origin repository, which always counts as named, and except what the keep-off list names.

### R-13

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Collector; Rules applied before any write, rule 10) and AC-21, AC-23
EVIDENCE: The Collector section says "When a file lists `dependabot_alerts` as `enabled` for a repository, the collector records that repository's Dependabot surface as incomplete with reason `alerts-enabled-this-run`". `helper-receipt-missing` applies only to a repository "without an accepted helper file". Rule 10 says "a write that fails is `not-changed` with its status". It also says "A write that succeeds but whose setting is not read back as on is `not-changed` with the write's status and the detail 'not on after write'". So a valid helper file can record `dependabot_alerts` as `not-changed` after a `PUT vulnerability-alerts` that GitHub accepted. Two examples are a 204 followed by a lagging 404 read-back, and a write that timed out but took effect. For that repository, `collect` reads the now-enabled alerts endpoint through `alertSurface` (`plugins/vh-adlc/scripts/maintenance/collect.ts:108-115`). It records the surface `complete` with whatever partial count it gets, and `security-reconcile` raises a coverage gap only for an incomplete surface (`plugins/vh-adlc/scripts/maintenance/security.ts:143`). The Background records 47 alerts listed "about 20 seconds later" after the PUT, so a partial list just after a write is the observed behaviour. This is the coverage gap the feature exists to close.
PROPOSAL: Have `collect` record the Dependabot surface as incomplete whenever the helper file shows that an alerts write was attempted. That covers `enabled`, and `not-changed` with `api-error` after a write. Add an AC-21 or AC-23 fixture where the PUT returns 204, the read-back returns 404 and the alerts endpoint then returns a partial list.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: Design (Procedure changes: mode function; Settings) and AC-24
EVIDENCE: `security-settings-mode` reads "the committed settings through the same binding as `resolveStanding`", and the helper's `apply` "fails visibly when that binding does not resolve". That binding throws when `refs/remotes/origin/<branch>` differs from the given commit (`plugins/vh-adlc/scripts/maintenance/authority.ts:92`). It treats a committed file holding any key outside its fixed list as invalid (`authority.ts:100-101`, `:111`). That list lacks `security_policy`, which `plugins/vh-adlc/scripts/maintenance/settings.ts:71` accepts, and the Design adds only the two new keys. Because of Q51 the mode read cannot simply reuse `resolveStanding`'s result, so it needs its own validation. The document does not say which key list that validation uses. It also does not say what the mode command prints, or what the skill then does, when the binding throws or the committed settings are invalid. One example is a consumer that committed both `security_policy` and `security_settings: apply`. AC-24 covers only a `security_settings` value other than `apply` or `check`.
PROPOSAL: Say which key list the mode read validates against. State that a binding failure or invalid committed settings gives `check` with a named reason, or a visible failure that the skill handles like a helper failure without running `apply`. Add an AC-24 fixture for that case.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Design (Procedure changes: coverage handoff) and AC-21
EVIDENCE: `security-reconcile` treats a coverage handoff as tracked only when `owner` or `assignment_handoff` is set: `function tracked(f: FollowUp | null): boolean { return !!f && !!(f.owner || f.assignment_handoff); }` (`plugins/vh-adlc/scripts/maintenance/security.ts:117`). It pushes `coverage handoff pending` for an incomplete surface whose handoff is not tracked (`security.ts:143`). A handoff is `{ reference, owner, assignment_handoff, next_action }` (`security.ts:7`), supplied through `coverage_handoffs` rows `{repository, surface, handoff}` (`plugins/vh-adlc/scripts/maintenance/security-io.ts:75`). The Design says only that the skill "records a coverage handoff naming the next sweep". AC-21's proof expects "no such gap with one naming the next sweep". A handoff that names the next sweep only in `next_action`, with null `owner` and `assignment_handoff`, still produces the gap, so the skill text and the fixture can disagree.
PROPOSAL: State the handoff's fields, for example `assignment_handoff` naming the next maintenance sweep and `next_action` re-collecting the surface. Make the AC-21 fixture and the skill instruction use exactly that shape.

### R-14

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria (AC-11, AC-24) and Design (Helper)
EVIDENCE: The R-13 fold added this to the Design (Helper): "When the binding fails or the committed settings are invalid, `security-settings-mode` exits nonzero naming the cause, and the skill handles that like a helper failure: it runs the helper in `check` with that cause as the mode reason and never runs `apply`." Q53 records the same decision. The AC-24 Test Plan row now checks "one that also commits `security_policy` gives `apply`; one whose `--default-commit` differs from `origin/<branch>` exits nonzero naming the cause". The AC-24 criterion text covers neither case. Its only failure case is "A `security_settings` value other than `apply` or `check` fails visibly". AC-11 lists the statements the maintenance skill, `references/loop.md` and `references/lifecycle.md` must carry. None of them says that a nonzero `security-settings-mode` exit selects `check` with the cause as the mode reason and never `apply`. Onboarding also calls the command (Design, Procedure changes), and the document does not say what onboarding does when the command fails. So an implementation can meet every criterion as written and still leave out the Q53 skill behaviour. A reviewer judging AC-24 by its text would also not require the two new fixtures.
PROPOSAL: Add to AC-24 that a binding failure or invalid committed settings make `security-settings-mode` exit nonzero naming the cause, and that a committed `security_policy` key does not prevent `apply`. Add to AC-11 that the maintenance skill, `references/loop.md` and `references/lifecycle.md` state that such a failure leads to `check` with the cause as the mode reason and never to `apply`.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Helper; Procedure changes: mode function and authority row)
EVIDENCE: The only writer is the helper's `apply`. The Design says `apply` "reads `security_settings_keep_off` from the committed, linked settings at `--default-commit` on `--default-branch`" and "fails visibly when that binding does not resolve". It does not say that `apply` checks whether those same committed settings adopt `security_settings: apply`, or whether they name the `--repository` target. Those checks are made only in `security-settings-mode`, and the skill text then decides which helper command to run. These rules are therefore enforced only by the skill: the authority row ("only when the consumer's committed settings adopt `security_settings: apply`"), Q48 (`not-in-committed-scope`), Q49 (onboarding "never runs ... the helper's `apply` on an in-session yes") and Q53 (a failed mode read "never runs `apply`"). The helper already holds the bound committed file. Even so, an agent that misreads the mode output, or that runs `apply` after an in-session yes, writes GitHub settings in a consumer that never opted in. AC-24 tests only the mode command, and no fixture runs `apply` against committed settings that do not adopt it.
PROPOSAL: Make the helper's `apply` refuse every write, and report the entries as `check` would with a named reason, when the bound committed settings do not adopt `security_settings: apply` or do not name the target (the origin always counts). Add a fixture that runs `apply` against committed settings that do not adopt it and records no write.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Design (Collector)
EVIDENCE: The document says "The operations table in `references/maintenance-settings.md:103-123`". At `0aea08b`, `git show 0aea08b:plugins/vh-adlc/references/maintenance-settings.md | nl -ba` shows the header `| Operation | Inputs and result |` at line 103 and the last row, `adoption-preflight`, at line 124. Line 125 is blank.
PROPOSAL: Cite `references/maintenance-settings.md:103-124`.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Frontmatter (covers) and AC-21
EVIDENCE: AC-21 requires that "`security-reconcile` accepts that inventory and reports the gap `coverage handoff pending` ... unless the analysis records a coverage handoff". The Design cites the code that decides this: `tracked` at `plugins/vh-adlc/scripts/maintenance/security.ts:117` and the gap at `security.ts:143`. `covers` lists `security-io.ts`, `collect.ts`, `authority.ts` and other maintenance scripts, but not `plugins/vh-adlc/scripts/maintenance/security.ts`. The standard says `covers` "lists every path whose change can affect the feature".
PROPOSAL: Add `plugins/vh-adlc/scripts/maintenance/security.ts` to `covers`.

### R-15

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design (Helper: state table and "Rules applied before any write") and AC-24
EVIDENCE: The R-14 fold added this to Design (Helper): "`apply` also makes no write, and reports its entries as `check` would with reason `not-adopted` or `not-in-committed-scope`". AC-24 says the same, and its Test Plan row passes when "entries reported with `not-adopted` and `not-in-committed-scope`". The state table gives the only `not-changed` reasons as "`check-only`, `alerts-off` or `api-error` with the HTTP status". Rules 1 to 10 have no step that gives `not-adopted` or `not-in-committed-scope`. Rule 8 gives `check-only` to an off and free entry under `check`. The same string `not-in-committed-scope` is also a mode reason: `security-settings-mode` prints it, the skill passes it to `check` through `--mode-reason`, and the output shows it as "the mode and that reason". So it is unclear whether the refusal replaces each entry's `check-only` reason, sets only the mode reason, or does both. It is also unclear where the refusal sits in the precedence order, for example for an entry already on or kept off. The same situation, a target outside the committed scope, then gives different entry reasons on the mode path and on the helper-refusal path. `references/security-settings.md` must list "states, reasons ... precedence", and AC-10 and AC-22 compare reasons between JSON and Markdown. An implementer who builds the reason set from the state table would reject `not-adopted`.
PROPOSAL: Say whether `not-adopted` and `not-in-committed-scope` are entry reasons or mode reasons. If they are entry reasons, add them to the `not-changed` row of the state table and give them a place in the numbered rules, for example as a refusal step just before rule 8 that replaces `check-only`. If they are mode reasons only, change the Helper text and AC-24 to say the entries keep `check-only` and the output's mode reason names the refusal.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design (Collector; Procedure changes: report command) and AC-11
EVIDENCE: The Design makes `--security-settings FILE` repeatable on both `collect` and `report`, and makes `--applied-repository OWNER/NAME` repeatable on `collect`. The maintenance CLI rejects any repeated flag: `if (!allowed.includes(key) || !value || value.startsWith("--") || Object.hasOwn(args, key)) throw Error("maintenance invalid or duplicate argument");` (`plugins/vh-adlc/scripts/maintenance/cli.ts:36`). Its arguments are stored as `Record<string, string>` (`cli.ts:33`). The reference page says "All flags take a value, including `true`/`false` booleans. Reject duplicate or unknown flags." (`plugins/vh-adlc/references/maintenance-settings.md:100`). Neither the Design nor AC-11 says that the parser or that sentence changes. An implementation that matches the Design would either break the documented duplicate-flag rule without saying so, or have no way to pass more than one helper file.
PROPOSAL: State that the maintenance CLI accepts these two flags more than once as a named exception, and that `references/maintenance-settings.md:100` says so. Add that statement to AC-11. Alternatively, take one argument that lists several files or repositories, and keep the duplicate-flag rule as it is.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Acceptance Criteria (AC-11)
EVIDENCE: AC-11 requires the collector rules "in `references/maintenance.md` and `references/maintenance-settings.md` without the old 'only a configured exact match' wording". Searching for `only a configured exact match` and `configured exact` in `plugins/vh-adlc/references/` and `plugins/vh-adlc/skills/` found one hit. It is in `references/maintenance.md:78`, which says "Only the configured exact status/literal-message/evidence match is complete-unavailable". `references/maintenance-settings.md:46-48` says "Only the exact declared surface/status and matching message receive `complete-unavailable`... A bare 403/404 is unknown." The quoted phrase appears in neither file, so the check "without the old wording" passes even if neither sentence is changed.
PROPOSAL: Quote the two current sentences exactly, or reword the criterion so that neither page says that only a configured match, or only the exact declared match, is `complete-unavailable`.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Frontmatter (covers)
EVIDENCE: `security-settings-mode` decides the mode from "the recorded request" and from whether "the run's scope has a pull request". `collect` and `report` accept a helper file only when it "carries the current run ID" and "names one repository in the sweep's scope". The skill saves each helper JSON "in the run's private journal directory". The request, the run scope and the private directory are defined in `plugins/vh-adlc/scripts/maintenance/journal.ts`: `request: JSONObject | null` at line 13, `createRun` at line 154, `readRun` at line 171 and `privateDirectory` at line 105. `covers` lists the other maintenance scripts the feature depends on, but not `journal.ts`. The standard says `covers` "lists every path whose change can affect the feature".
PROPOSAL: Add `plugins/vh-adlc/scripts/maintenance/journal.ts` to `covers`.

### R-16

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria (AC-11) and Test Plan (AC-11, AC-20)
EVIDENCE: AC-11 opens with "`references/security-settings.md`, `references/authority.md`, `references/maintenance.md`, `references/maintenance-settings.md`, `references/loop.md`, `references/lifecycle.md`, the maintenance skill and `docs/user-guides/workflows.md` state:" and then lists clauses. Some clauses name the file that must carry them, for example "in `references/maintenance.md` and `references/maintenance-settings.md`" and "in the maintenance skill". Others name no file: "sweeps and onboarding run the helper before collection in the mode `security-settings-mode` prints", "the Renovate and Dependabot rules", "the private, archived and keep-off rules", "that `renovate-overlap`, `owner-choice-conflict` and `paused` go to the owner", "the precedence order" and "that no setting is ever turned off". The criterion can be read in two ways. In the first, every one of the eight files must state each unqualified clause, so `references/authority.md`, `references/loop.md`, `references/lifecycle.md` and `docs/user-guides/workflows.md` would each restate the precedence order and the detection rules. In the second, the clause only has to appear somewhere among the eight files. The Test Plan says only "confirms each listed rule is stated". The two readings lead to different verdicts in an implementation review. The first reading also conflicts with the Design, which puts the states, reasons and precedence in `references/security-settings.md` and links to it from the other pages.
PROPOSAL: For each unqualified AC-11 clause, name the file or files that must carry it, for example in a small table that maps each statement to its pages. Alternatively, say that each unqualified clause needs to appear in `references/security-settings.md` only, and that the other pages link to it.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Procedure changes: report command and maintenance skill step) and AC-22
EVIDENCE: The Design says the report command "gains `--security-settings FILE`, repeatable", that "The saved report then has a `## Repository security settings` section", and that "The section names every repository in scope, with a 'helper did not run' row for one without a file, so no repository drops out silently." It also says "A helper failure or exit 1 never blocks collection", and the skill passes only the JSON files it saved. Suppose the helper crashes or produces no valid JSON for every repository. This is the common case for a sweep whose scope is only the origin repository. The skill then calls `report` with no `--security-settings` flag at all, and nothing in the Design says the section is rendered in that case. The existing renderer shows how an absent input is usually handled: it prints "Security accounting: pending (no typed security snapshot supplied)." when no security revision is passed (`plugins/vh-adlc/scripts/maintenance/report.ts:124`). The AC-22 fixture uses three files for four repositories, so it does not cover a call with zero files.
PROPOSAL: Say that every sweep report renders the section, with a "helper did not run" row for each repository in scope when no file is given. Add an AC-22 fixture that renders a report with no `--security-settings` flag and expects that section.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Helper; Procedure changes: mode function and authority row) and AC-24
EVIDENCE: Q55 makes the helper's own `apply` refuse writes when the committed settings do not adopt `security_settings: apply` or do not name the target, "so the opt-in does not rest on the skill alone". Other rules also send a run to `check`: the request flags `read_only`, `draft_only`, `no_push` and `no_filesystem`, a recorded request without `authorized_sweep` true, and a run whose scope has a pull request. Only `security-settings-mode` applies these. The helper's `apply` also takes `--run-id`, but the Design uses it only to write the ID into the JSON. AC-24 defines no helper refusal for these cases. With no recorded request, `security-settings-mode` prints `apply` (AC-24: "also with no recorded request"). So a skill that leaves out `--run-id` when it calls the mode command, or that runs `apply` anyway, writes GitHub settings during a read-only or PR-scoped sweep. That breaks "Current restrictions win" (`plugins/vh-adlc/skills/vh-adlc-maintenance/SKILL.md:24`) and the authority row.
PROPOSAL: When `apply` gets `--run-id`, have it read that run's recorded request and scope and refuse every write under the same rules as `security-settings-mode`, with mode `check` and a named mode reason. Add a security-settings fixture for this, for example a run recorded with `read_only`. Otherwise, record in the document that the request and scope restrictions deliberately rest on the skill.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Design (Helper; Settings) and AC-24
EVIDENCE: The `check` command has no `--default-branch` or `--default-commit` flag (`check --repo PATH [--repository OWNER/NAME] [--run-id ID] [--mode-reason TEXT] [--format json|markdown]`), and "`--repo` is the checkout whose `.vh-adlc/maintenance.yaml` applies". Only `apply` is said to read `security_settings_keep_off` from the committed, linked settings. Rule 5 (keep-off) applies under both modes. AC-24 and its proof require that a refused `apply` "reports its entries exactly as `check` would" and that the "entries [are] identical to `check` output". Suppose `check` reads keep-off rows from the working tree. Then a keep-off row that differs between the working tree and the committed settings changes one entry: `check` gives `not-changed` with `check-only`, while the refused `apply` gives `left-off` with `owner-choice`, or the reverse. The two outputs are no longer identical, and the exit code differs too. The Design does not say where `check` reads its keep-off rows.
PROPOSAL: State where `check` reads keep-off rows, either the working tree or the committed settings when it is given a binding. Then make "exactly as `check` would" mean that same source for the refused `apply`.

### R-17

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design (Helper) and AC-24, AC-11
EVIDENCE: The Design says: "When the binding fails or the committed settings are invalid, `security-settings-mode` exits nonzero naming the cause, and the skill handles that like a helper failure: it runs the helper in `check` with that cause as the mode reason and never runs `apply`." The R-16 fold added: "`check` reads keep-off rows from the committed settings when given `--default-branch` and `--default-commit`, which the skill always passes, and from the working tree otherwise." So in this fallback, `check` gets the same binding that just failed. Examples are a `--default-commit` that differs from the tracking tip (`plugins/vh-adlc/scripts/maintenance/authority.ts:92` throws "default commit differs from recorded tracking tip") and committed settings with an invalid key or a `security_settings: maybe` value. The Design says only that `apply` "fails visibly when that binding does not resolve". It does not say what `check` does with an unresolved binding or invalid committed settings. AC-15 requires that a settings file naming an unknown setting fails visibly. If `check` fails in the same way, the fallback that AC-11 requires ("a nonzero `security-settings-mode` exit leads to `check` with the cause as the mode reason") produces no JSON, and the report shows only "helper did not run". The AC-24 proof tests the binding failure only for `security-settings-mode`, not for the helper's `check` that follows it.
PROPOSAL: State what `check` does when its binding fails or the committed settings are invalid. One option is to read keep-off rows from the working tree, or to use none, and report the cause as the mode reason. Another is for the skill to leave out the binding in this fallback. Then add an AC-24 fixture that runs the fallback `check` after a binding failure and expects entries with that mode reason.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: Design (Helper; Procedure changes: mode function) and Test Plan (AC-24)
EVIDENCE: The Design names only two mode reasons, `not-adopted` and `not-in-committed-scope`. The helper's `--run-id` refusal uses "the reason that command would print" for "request flags, missing `authorized_sweep`, a pull-request scope". The AC-24 proof passes on "the `read_only` reason and the pull-request reason". Those reasons are not named anywhere in the document. The document also gives no order for choosing one when several causes apply, for example committed settings that do not adopt `apply` together with a `read_only` request. Yet `references/security-settings.md` must document the reasons and the precedence (AC-11).
PROPOSAL: Name each mode reason, for example `request-restricted`, `not-authorized-sweep` and `pull-request-scope`, and give one order for choosing among them. Use those names in the AC-24 pass condition.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Design (Procedure changes: maintenance skill step) and Acceptance Criteria
EVIDENCE: The Design says: "Under `check`, the report says how to opt in." No criterion or Test Plan row checks this for sweeps. AC-22 and its proof check only the section's tables, the "helper did not run" rows and the owner decisions list. AC-11 covers opt-in guidance only for onboarding, in `references/loop.md` and `references/lifecycle.md`. A sweep report in a consumer that has not opted in can satisfy every criterion without telling the owner how to opt in.
PROPOSAL: Add to AC-22 that when any repository's mode is `check`, the section names the `security_settings: apply` opt-in. Add a matching pass condition to the AC-22 proof. Otherwise, remove the sentence from the Design.

### R-18

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria (AC-24) and Test Plan (AC-24)
EVIDENCE: AC-24 (docs/specs/repository-security-settings.md:762-765 at d62f5b5) says: "A binding failure or invalid committed settings make `security-settings-mode` exit nonzero naming the cause, and the helper's `check` given that binding still reports its entries, with mode reason `committed-settings-unresolved`." The Design (lines 328-330) says that in this case `check` "reads keep-off rows from the working tree". The AC-24 proof (line 801) has one fixture for this clause: "one whose `--default-commit` differs from `origin/<branch>` exits nonzero naming the cause, and the helper's `check` with that same binding then exits as usual". No fixture commits invalid settings, such as an unknown key or `security_settings: maybe`, while the working tree stays valid. The `security_settings: maybe` fixture does not say whether the value is committed or in the working tree. If it is in the working tree, `loadSettings` fails first (`plugins/vh-adlc/scripts/maintenance/settings.ts:68-70`). So the invalid-committed-settings half of this composite clause is never exercised, for either the mode exit or the helper's `check` fallback to working-tree keep-off rows. Under the review standard, a passing subset does not upgrade a composite criterion, so AC-24 would be `untested` at implementation review.
PROPOSAL: Add an AC-24 fixture whose committed settings are invalid, for example a committed `security_settings: maybe` with a valid working tree that has a keep-off row. It passes when `security-settings-mode` exits nonzero naming the field, and the helper's `check` with that binding reports entries using the working-tree keep-off row and mode reason `committed-settings-unresolved`.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Test Plan (AC-22)
EVIDENCE: The AC-22 proof (line 799) describes "A second report rendered with no `--security-settings` flag", which passes when "the section is present with a 'helper did not run' row for each repository in scope". It then adds: "In both reports, with a file whose mode is `check`, the section names the `security_settings: apply` opt-in." The second report has no helper file, so it cannot have "a file whose mode is `check`". AC-22 (line 743) ties the opt-in line to "any repository's mode is `check`", and no mode is known when no file is given. The pass condition contradicts itself for the second report, and no fixture shows that the opt-in line is absent when every file is in `apply`.
PROPOSAL: Limit the opt-in pass condition to the first report, which includes one file in `check` mode. Then either add a report whose files are all in `apply` and expect no opt-in line, or say what a report with no files shows about the opt-in.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Acceptance Criteria (AC-11) and Design (Helper; Procedure changes: mode reasons)
EVIDENCE: AC-11 (lines 682-684) requires the maintenance skill, `references/loop.md` and `references/lifecycle.md` to state "that a nonzero `security-settings-mode` exit leads to `check` with the cause as the mode reason and never to `apply`." The R-17 fold changed the Design (lines 326-328) to: "it runs the helper in `check` with mode reason `committed-settings-unresolved` and the cause", and line 555-556 adds "the binding-failure fallback uses `committed-settings-unresolved` with the cause". A skill text that passes only the cause as `--mode-reason` satisfies AC-11 but contradicts the Design. The Design also covers only a binding failure or invalid committed settings. AC-11 covers any nonzero exit, such as an unreadable `--run-id` or invalid working-tree settings, and no named reason is given for those.
PROPOSAL: Reword the AC-11 clause to "leads to `check` with mode reason `committed-settings-unresolved` and the cause". Either say that every nonzero exit of the command uses that reason, or name the reason for exits with other causes.

### R-19

FINDING: F-01
KIND: judgement
SEVERITY: nit
WHERE: Acceptance Criteria (AC-22) and Design (Procedure changes: report section)
EVIDENCE: The R-18 fold changed AC-22 to: "When any repository's mode is `check`, or no file is given, the section names the `security_settings: apply` opt-in; when every file is in `apply`, it does not." The Design's report paragraph covers `renderReport`, the section, the "helper did not run" rows and "Every sweep report renders the section, also with no `--security-settings` flag". It does not mention the opt-in line or when it appears. The only Design sentence on this is in the skill step: "Under `check`, the report says how to opt in." The Design also says a rejected file (malformed, out of scope, repeated, or from another run) "is ignored for collection and shown in the report as 'helper did not run'". Neither the Design nor AC-22 says whether a rejected file's claimed mode counts toward "any repository's mode is `check`" or "every file is in `apply`". The criterion also does not say what happens when files are given but every one is rejected.
PROPOSAL: Add the AC-22 opt-in rule to the Design's report paragraph as `renderReport` behaviour, and word it in terms of accepted files. For example: the section names the opt-in unless at least one file is accepted and every accepted file's mode is `apply`.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Test Plan (AC-24)
EVIDENCE: The R-18 fold added this fixture: "Another commits `security_settings: maybe` with a valid working tree holding a keep-off row for secret scanning. Pass: ... the helper's `check` with that binding reports secret scanning `left-off` with `owner-choice` from the working-tree row". The fixture does not say whether the committed file also holds that keep-off row. If it does, an implementation that still reads keep-off rows from the invalid committed YAML passes, even though the Design says that in this case `check` "reads keep-off rows from the working tree". The fixture also does not say the repository is public with admin and secret scanning off. Rule 2 would make a private repository `unavailable`, and rules 5 and 7 would make secret scanning that reads as on `owner-choice-conflict`, so `left-off` with `owner-choice` depends on those details.
PROPOSAL: State that the committed settings have no keep-off row for secret scanning, or have a different one, and that the fixture is a public admin repository with secret scanning off.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Design (Helper)
EVIDENCE: Both commands accept `[--mode-reason TEXT]` (`check ... [--mode-reason TEXT]`, `apply ... [--mode-reason TEXT]`). The only meaning given is: "`check` also accepts `--mode-reason`, the reason `security-settings-mode` printed". The helper also chooses mode reasons itself. `apply` refuses with `not-adopted`, `not-in-committed-scope` or a run-derived reason, and `check` "reports `committed-settings-unresolved` with the cause as its mode reason" when its binding fails. The skill always passes the binding to `check`, including when it chose `check` itself with `request-restricted` for `no_filesystem` or a restricted onboarding request. So `--mode-reason request-restricted` and an unresolved binding can occur together. Nothing says which reason the JSON shows, or what `apply` does with a passed `--mode-reason`, such as `adopted`, when it then refuses.
PROPOSAL: State one rule: the helper's own refusal or binding-failure reason takes precedence over `--mode-reason`, or both are shown. Either say what `apply` does with `--mode-reason` or remove the flag from `apply`.

### R-20

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria (AC-22) and Test Plan (AC-22, AC-23)
EVIDENCE: The R-19 fold added this clause to AC-22 (lines 754-756): "The section names the `security_settings: apply` opt-in unless at least one helper file is accepted and every accepted file's mode is `apply`; a rejected file's claimed mode does not count." The Design matches it (line 594-596). The AC-22 proof (line 812) covers only four cases: a first report where one accepted file is in `check`, a third report where every file is in `apply`, a report with no files, and the no-flag report. The AC-23 proof (line 813) adds bad files to `collect` and `report`, but it checks only "helper did not run" and that no `alerts-enabled-this-run` comes from them. It never checks the opt-in line. No fixture covers a report where a rejected file claims `check` and every accepted file is `apply`, or a report where every given file is rejected. Suppose an implementation counts a rejected file's claimed mode. It passes every listed fixture and still breaks the clause. Because a passing subset never upgrades a composite criterion, AC-22 would be `untested` at implementation review.
PROPOSAL: Add two AC-22 report fixtures. In the first, every accepted file is in `apply` and one rejected file, such as one with another run ID, claims `check`; it passes when the section has no opt-in line. In the second, every given file is rejected and claims `apply`; it passes when the section names the opt-in.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria (AC-24), Design (Helper; Procedure changes: mode reasons) and Test Plan (AC-24)
EVIDENCE: AC-24 (lines 778-782) says: "The helper's `apply` makes no write, and reports its entries exactly as `check` would, with mode `check` and mode reason `not-adopted` or `not-in-committed-scope`, when the bound committed settings do not adopt `security_settings: apply` or do not name the target, or when its `--run-id` names a run whose recorded request or scope selects `check`." So the criterion requires `not-adopted` or `not-in-committed-scope` for the run-based refusals too. The AC-24 proof (line 814) expects the `--run-id` fixtures to give "`request-restricted` naming `read_only`, and `pull-request-scope` respectively". The Design (line 326) gives that refusal "the reason that command would print". An implementation can satisfy the criterion or the proof, but not both. The Design also leaves open which reason the helper's `apply` prints when the committed settings do not adopt `apply` and the run is `read_only`. Line 321 says `not-adopted`. Line 326 and the order at line 561 give `request-restricted`. The proof's `read_only` run fixture does not say whether its committed settings adopt `apply`.
PROPOSAL: Reword the AC-24 clause so the helper's refusal reason is the first that applies in the ordered list at line 561, the same reason `security-settings-mode` would print. State in the Design that `apply` uses that order. In the proof, say the `read_only` and pull-request `--run-id` fixtures use committed settings that adopt `apply`, and add one helper fixture that does not adopt `apply` and has a `read_only` run, expecting `request-restricted`.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Frontmatter (goal)
EVIDENCE: The goal (line 5) says "Every maintenance sweep and onboarding by a consumer that opts in turns on, in each repository of its scope, Dependabot alerts ...". The Owner summary (line 51) and the Design (line 554) say "only a full authorized sweep writes; a PR-scoped assessment checks". A request with `read_only`, `draft_only`, `no_push`, `no_filesystem` or no `authorized_sweep` true also gives `check` (Q26, Q41). A repository that the committed settings do not name gets `not-in-committed-scope` (Q48), and keep-off rows are never written (Q10). The goal names none of these limits. With every box ticked, an opted-in consumer's PR-scoped or read-only sweep turns nothing on, which the goal as worded does not allow.
PROPOSAL: Narrow the goal to "every full authorized maintenance sweep and onboarding by a consumer that opts in turns on, in each repository its committed settings name and except what its keep-off list names, ...", to match the Owner summary.

### R-21

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria (AC-24) and Test Plan (AC-24)
EVIDENCE: AC-24 (lines 787-791 at 48bd339) says the helper's `apply` makes no write "when its `--run-id` names a run whose recorded request or scope selects `check`; its mode reason is the first that applies in the ordered mode reasons, the same reason `security-settings-mode` would print". The Design (line 565) orders the mode reasons as `request-restricted`, `not-authorized-sweep`, `pull-request-scope`, `not-adopted`, `not-in-committed-scope`. The AC-24 proof (line 819) has only three helper `--run-id` fixtures: a `read_only` run, a pull-request run and a `read_only` run without adoption. None has a recorded request without `authorized_sweep` true, and the helper checks that condition separately from the request flags. A run with `{"authorized_sweep": false}` can be recorded, because `start` stores whatever `--request` it is given (`plugins/vh-adlc/scripts/maintenance/cli.ts:66-69`). The mode-command fixtures for `{ "authorized_sweep": false }`, for the pull-request run and for "settings that do not adopt it and no request" pass on "each gives `check`" or "`check`" alone. They never assert the printed reasons `not-authorized-sweep`, `pull-request-scope` or `not-adopted`. The skill passes that printed reason to `check`. An implementation whose helper `apply` ignores `authorized_sweep`, or whose mode command prints the wrong reason, passes every listed fixture. A passing subset never upgrades a composite criterion, so AC-24 would be `untested`.
PROPOSAL: Add a security-settings fixture that runs `apply` with `--run-id` for a run recorded with `{"authorized_sweep": false}` and committed settings that adopt `apply`, and expect no write and `not-authorized-sweep`. In the mode-command fixtures, assert the printed reason as well as `check`: `not-authorized-sweep`, `pull-request-scope` and `not-adopted`.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design (Procedure changes: user guide) and Acceptance Criteria (AC-11)
EVIDENCE: The Design (line 615) says "`docs/user-guides/workflows.md` gets a section beside 'Stale branches' describing the default and the manual commands". The Background says the guide today "describes no other repository setting" (`docs/user-guides/workflows.md:143-145`). AC-11 lists `docs/user-guides/workflows.md` among the pages that "state the following". It then says "A clause that names no page needs to appear only in `references/security-settings.md`" (Q58), and that "a clause that names pages must appear in each of them". No clause in AC-11 names `docs/user-guides/workflows.md`, and no other criterion mentions it. The AC-11 proof confirms only "each listed rule is stated". So the implementation can tick every box and leave the user guide unchanged, without the new section, the `check` default, the `security_settings: apply` opt-in or the manual commands.
PROPOSAL: Add an AC-11 clause naming `docs/user-guides/workflows.md`. It should require a section beside "Stale branches" that states the `check` default, the `security_settings: apply` opt-in and the manual commands, and links to `references/security-settings.md`. Or remove the user guide from the Design and from AC-11's page list.

### R-22

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan (AC-01, AC-03, AC-04 and AC-16 rows)
EVIDENCE: AC-03 (line 633) covers a repository "with a `.github/dependabot.yml` or `.github/dependabot.yaml`", and the Design (line 450) says Dependabot is configured when either file exists. Q6 and Q22 made both names part of the rule, and docs#30 at 4b2198d names both ("a `.github/dependabot.yml` or `.github/dependabot.yaml`"). The fixture for AC-03 (line 806) uses only `.github/dependabot.yml`. No row in the Test Plan has a `.github/dependabot.yaml` fixture. AC-16 (line 725) covers "a private or internal repository" and says "with either feature enabled, the same read leaves the surface incomplete", where the features are `advanced_security` and `code_security`. Its proof (line 827) has only private fixtures and only a `code_security` enabled fixture. It has no internal repository and no `advanced_security` enabled fixture. AC-05 tests an internal repository, but only in the helper, while AC-16 is about the separate collector rule in `collect.ts`. Three implementations would pass every listed fixture: a helper that looks only for `dependabot.yml`, a collector that tests `visibility === "private"`, and a collector that reads only `code_security`. A passing subset never upgrades a composite criterion, so AC-03 and AC-16 would be `untested` at implementation review.
PROPOSAL: Add an AC-03 fixture with only `.github/dependabot.yaml` that expects security updates `enabled`. Add AC-16 collector fixtures for an internal admin repository with `security_and_analysis` null that expects `complete-unavailable`, and for a private admin repository with only `advanced_security` enabled that expects the surface to stay incomplete.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Test Plan (AC-24)
EVIDENCE: The R-21 fold added a sixth helper fixture to the AC-24 proof (line 824). The proof now lists six `apply` fixtures: no adoption, a target that is not named, a `read_only` run, a pull-request run, no adoption with a `read_only` run, and `{"authorized_sweep": false}`. It then says "Pass: no write recorded, entries identical to `check` output with the same binding, with mode `check` and mode reason `not-adopted`, `not-in-committed-scope`, `request-restricted` naming `read_only`, and `pull-request-scope` respectively." That gives four reasons for six fixtures, so "respectively" does not map cleanly. The sixth fixture states only "expects no write and `not-authorized-sweep`". It is unclear whether the condition "entries identical to `check` output" and mode `check` also apply to it.
PROPOSAL: Give each of the six helper fixtures its expected reason in one ordered list. Also state that the common pass condition (no write, entries identical to `check` with the same binding, mode `check`) applies to all six.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Design (Procedure changes: coverage handoff)
EVIDENCE: The Design (line 572) says the skill records a coverage handoff "whose `assignment_handoff` names the next maintenance sweep and whose `next_action` is to collect the surface again". A coverage handoff is parsed by `followUp` (`plugins/vh-adlc/scripts/maintenance/security.ts:53-56`). That function requires exactly the keys `reference`, `owner`, `assignment_handoff` and `next_action`, and `reference` must be non-empty text (`v.text(f.reference)`). The handoff list is also scoped by `repository` and `surface` (`plugins/vh-adlc/scripts/maintenance/security-io.ts:75`). The Design does not say what `reference` the skill records, or that `owner` is null. No reference page documents the handoff shape: a grep for `assignment_handoff` and `coverage_handoffs` in `plugins/vh-adlc/references/*.md` returns nothing. A skill text that follows the Design as written would produce a handoff that fails validation.
PROPOSAL: State the complete handoff the skill records, for example `reference` set to the run ID or report path, `owner` null, `assignment_handoff` naming the next maintenance sweep and `next_action` to collect the surface again. Also state that it goes in `coverage_handoffs` with the repository and surface `dependabot`.

### R-23

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Helper; Procedure changes: mode command and skill step), Acceptance Criteria (AC-24) and Test Plan (AC-24)
EVIDENCE: The Design (line 331) says that with `--run-id`, `apply` "also reads that run's recorded request and scope and refuses every write". The listed refusal causes are request flags, missing `authorized_sweep` and a pull-request scope. `security-settings-mode` (lines 553-562) checks the same three, plus committed adoption and committed `repositories` (line 556). Neither command checks that `--repository` is in the run's recorded scope. A run's scope can be narrower than the committed list, because `start --repository X` records `scope.repositories: [X]` (`plugins/vh-adlc/scripts/maintenance/cli.ts:68`). The skill step (line 582) and the authority row (line 609) limit writes to "a repository in its scope". Nothing in the helper enforces that, so the limit rests on the skill alone, which Q55 and Q60 set out to avoid. `collect` and `report` reject a helper file that "names a repository outside the scope" (line 494), and `portableObservations` requires the inventory scope to equal the run's scope (`plugins/vh-adlc/scripts/maintenance/report.ts:90-91`). So an alerts write to the origin during a run narrowed to another repository would leave no receipt in the report and no `alerts-enabled-this-run` surface. No AC-24 fixture covers a target outside the run's scope.
PROPOSAL: When `--run-id` is given, have `security-settings-mode` and the helper's `apply` return `check` with a named mode reason (for example `not-in-run-scope`) for a target outside the run's recorded `scope.repositories`, placed in the ordered reason list. Add an AC-24 fixture with a run started with `--repository` for one repository and `apply` targeting the origin. It passes when no write is recorded and that reason is printed.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Acceptance Criteria (AC-11) and Test Plan (AC-21)
EVIDENCE: The R-22 fold (Q70) states the full handoff in the Design (lines 574-578): it goes in `coverage_handoffs` with the repository, surface `dependabot`, `reference` set to the run ID, `owner` null, `assignment_handoff` naming the next sweep, and `next_action` to collect the surface again. These are the four keys `followUp` requires, and `reference` must be non-empty text (`plugins/vh-adlc/scripts/maintenance/security.ts:53-56`). AC-11 (line 699) only requires the skill to state "that an `alerts-enabled-this-run` surface gets a coverage handoff naming the next sweep". The AC-21 proof leaves the skill's instruction to "the AC-11 reviewer read". A skill text that names only the next sweep would pass AC-11 but still produce a handoff that fails validation, which is the problem R-22 F-03 raised.
PROPOSAL: Reword the AC-11 clause so the maintenance skill states the complete handoff the Design gives: `coverage_handoffs`, the repository, surface `dependabot`, `reference` set to the run ID, `owner` null, `assignment_handoff` naming the next sweep, and `next_action`.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Test Plan (AC-21)
EVIDENCE: The AC-21 proof (line 832) now has four fixtures, but its pass condition still says "`security-reconcile` accepts both inventories, reporting `coverage handoff pending` for the surface without a handoff and no such gap with one whose `assignment_handoff` names the next sweep". The phrase dates from 5e4f15b, when the row had two fixtures. The fourth fixture was added in 0aea08b. AC-21 says "The same holds when the file shows `dependabot_alerts` as `not-changed` with `api-error` after a write", which includes the reconcile behaviour. The proof does not say which inventories go to `security-reconcile`, or whether the fourth fixture's inventory is reconciled with and without a handoff. A passing subset never upgrades a composite criterion.
PROPOSAL: Say that `security-reconcile` runs on the first, second and fourth inventories, each once without a handoff and once with the handoff the Design specifies. Each passes when it reports `coverage handoff pending` only in the run without a handoff.

### R-24

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria (AC-24) and Test Plan (AC-24)
EVIDENCE: After the R-23 fold, AC-24 (lines 786-790 at 9e3883b) says `security-settings-mode` prints `check` "when the repository is outside the run's recorded `scope.repositories`". The Design orders that case as `not-in-run-scope` (lines 574-576). The AC-24 proof (line 838) checks this case only through helper fixture (7): "a run started with `--repository` for another repository ... `apply` targeting the origin, `not-in-run-scope`". None of the `security-settings-mode` fixtures in `tests/vh-adlc/maintenance` uses a run narrowed with `start --repository` (`plugins/vh-adlc/scripts/maintenance/cli.ts:68`). The skill passes the command's printed mode and reason to the helper, so this case matters in practice. An implementation where the mode command ignores the run's scope would pass every listed mode fixture. The fixtures where "`apply` is only in the working tree, only on an unmerged branch, or in a settings file `AGENTS.md` does not link" pass on "each gives `check`" alone and never assert `not-adopted`, although R-21 F-01 asked for printed reasons to be asserted. A passing subset never upgrades a composite criterion, so AC-24 would be `untested`.
PROPOSAL: Add a `security-settings-mode` fixture with a run started with `--repository` for a configured non-origin repository, committed settings that adopt `apply`, and `--repository` set to the origin. It passes when the output is `check` with `not-in-run-scope`. Also require `not-adopted` in the pass condition of the three working-tree, unmerged-branch and unlinked fixtures.

FINDING: F-02
KIND: judgement
SEVERITY: nit
WHERE: Design (Helper) and Acceptance Criteria (AC-24)
EVIDENCE: The Design (lines 334-338) says that when `apply` gets `--run-id`, "it also reads that run's recorded request and scope and refuses every write". It says what happens when the settings binding fails ("fails visibly when that binding does not resolve", line 329), but not when the run cannot be read. `readRun` throws for a missing run, an identity mismatch or a broken event chain (`plugins/vh-adlc/scripts/maintenance/journal.ts:171-185`). `security-settings-mode` has this covered because every nonzero exit leads to `check`. Nothing says the helper's `apply` must make no write when its `--run-id` cannot be read, and no AC-24 fixture tests that case. An implementation that treats an unreadable run as "no run", and so applies on the committed settings alone, would pass every listed fixture. The restriction would then rest on the skill again, which Q55 and Q60 set out to avoid.
PROPOSAL: State that `apply` with a `--run-id` it cannot read makes no write and either fails visibly or reports its entries as `check` would, with a named reason. Add one AC-24 helper fixture with a run ID that does not exist.

### R-25

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria (AC-11) and Design (Procedure changes)
EVIDENCE: `plugins/vh-adlc/references/maintenance.md:218-219` reads "Report helpers never push, merge shared main or mutate GitHub. The one exception is the branch helper's `apply` and `after-merge`". The Design (line 603) says "That sentence gains the security-settings helper's `apply`". R-6 F-01 added a matching AC-11 clause, which now reads (lines 701-703): "that the security-settings helper's `apply` is an exception to "Report helpers never ... mutate GitHub", with the recorded run as intent and the JSON saved in the run's private journal directory as receipt". That clause names no page. Since Q58, AC-11 says (lines 687-688): "A clause that names no page needs to appear only in `references/security-settings.md`". So an implementation that states the exception only in the new page passes AC-11 while `references/maintenance.md` still names the branch helper as "The one exception". The fold of R-6 F-01 no longer holds. The same applies to the Design line 617, "`references/maintenance.md` documents the section", which no criterion requires. It also applies to the skill step that runs the helper and passes `--security-settings` and `--applied-repository` to `collect` and `report` (lines 590-593), which the unqualified clause "Sweeps and onboarding run the helper before collection" does not tie to the skill.
PROPOSAL: Make the exception clause name `references/maintenance.md`, so its "one exception" sentence must list the security-settings helper's `apply`. Also require `references/maintenance.md` to document the new report section, and the maintenance skill's step to run the helper and pass its files to `collect` and `report`.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria (AC-24) and Test Plan (AC-24)
EVIDENCE: The Design says the helper's `apply` "fails visibly when that binding does not resolve" (line 332). The R-24 fold (Q72) adds: "When `apply` cannot read its `--run-id` (missing, mismatched or broken run), it makes no write and exits nonzero naming the run" (lines 341-342). AC-24 (lines 805-810) states only that `apply` makes no write when the bound committed settings do not adopt `apply` or do not name the target, or when the run's recorded request or scope selects `check`. It says nothing about an unreadable run or a failed binding. The Test Plan's eighth helper fixture (line 842) tests the unreadable run, but no criterion text carries it. No fixture runs the helper's `apply` with a failed binding: the `--default-commit` mismatch fixture runs only the mode command and the helper's `check`. If an implementation treats an unreadable run as "no run", or falls back to the working-tree settings when the binding fails and then writes, it meets every criterion as worded. The opt-in would again rest on the skill alone, which Q55, Q60 and Q72 set out to avoid.
PROPOSAL: Add to AC-24 that the helper's `apply` makes no write and exits nonzero naming the cause when its binding does not resolve, when the committed settings are invalid, or when its `--run-id` cannot be read. Add a helper `apply` fixture whose `--default-commit` differs from `origin/<branch>`. It passes when no write is recorded and the exit is nonzero.

### R-26

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design (Helper), Acceptance Criteria (AC-24) and Test Plan (AC-24)
EVIDENCE: The R-25 fold (Q73) added this to AC-24 (lines 816-818 at fd18d71): the helper's `apply` "makes no write and exits nonzero naming the cause when its binding does not resolve, the committed settings are invalid, or its `--run-id` cannot be read". The Design gives `apply` only two failure cases. It "fails visibly when that binding does not resolve" (lines 335-336), and it exits nonzero for an unreadable run (lines 341-342). For invalid committed settings, the Design states the nonzero exit only for `security-settings-mode` (line 350). It says nothing about `apply`. The Test Plan covers the binding case with the ninth helper fixture (`--default-commit` differs from `origin/<branch>`) and the run case with the eighth (a missing run). It has no helper `apply` fixture with invalid committed settings. The only committed `security_settings: maybe` fixture runs `security-settings-mode` and the helper's `check`. Under Q62, `check` falls back to the working tree's settings when the committed settings are invalid. An `apply` that shares that fallback, or that treats an invalid committed value as `not-adopted` and exits by its entries, passes every listed fixture and still breaks AC-24 as worded. A passing subset never upgrades a composite criterion, so AC-24 would be `untested`.
PROPOSAL: State in the Design that `apply` makes no write and exits nonzero naming the cause when the committed settings are invalid. Add a helper `apply` fixture that commits `security_settings: maybe` (or an unknown keep-off setting name) beside a valid working tree that adopts `apply`. It passes when no write is recorded and the exit is nonzero naming the field.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria (AC-11) and Design (Procedure changes)
EVIDENCE: The Owner summary (line 51) says "Only a full authorized sweep, or onboarding, may write". The Design's authority row (lines 621-622) says "a maintenance sweep or onboarding may enable these settings with `apply`". Onboarding "runs the command without one and the committed settings alone decide" (lines 576-578), so it gets `apply` when the committed settings adopt it. AC-11 (lines 711-713) requires the maintenance skill, `references/security-settings.md` and the authority row to state "that only a full sweep whose request has `authorized_sweep` true may apply". The Design's mode bullet (line 573) also says "So only a full authorized sweep writes". Onboarding has no maintenance request and no `authorized_sweep`. An authority row and reference page written to AC-11's wording would therefore forbid onboarding writes. At the same time, AC-11 requires `references/loop.md` and `references/lifecycle.md` to say onboarding runs the helper in the mode the command prints. The implementation reviewer would have to pass two pages that contradict each other on whether onboarding may write.
PROPOSAL: Reword the AC-11 clause and line 573 to "among maintenance runs, only a full sweep whose request has `authorized_sweep` true may apply; onboarding applies only as the committed settings decide". Alternatively, scope the clause explicitly to sweeps so the authority row still allows onboarding.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Design (Collector) and Acceptance Criteria (AC-11)
EVIDENCE: The Design (lines 513-516) adds the collector reason `helper-receipt-missing` for a repository passed with `--applied-repository` that has no accepted helper file. AC-11 requires only "the `not-free-on-private` and `alerts-enabled-this-run` collector rules" to be documented (line 697). No criterion asks any reference page to define `helper-receipt-missing`, although sweep reports and `security-reconcile` gaps will show it. Separately, the Design (line 525) says only `references/maintenance.md` names `alerts-enabled-this-run`. AC-11 requires both collector rules in `references/maintenance.md` and in `references/maintenance-settings.md`.
PROPOSAL: Add `helper-receipt-missing` to the AC-11 collector-rule clause. Make the Design and AC-11 agree on which pages name `alerts-enabled-this-run`.

### R-27

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Helper; Settings), AC-15, AC-17 and Context (Owner summary)
EVIDENCE: The Design says "`check` reads keep-off rows from the committed settings when given `--default-branch` and `--default-commit`, which the skill always passes, and from the working tree otherwise". It falls back to the working tree only "when the binding does not resolve or the committed settings are invalid". The Design does not say what happens when the binding resolves but the committed settings are unlinked or absent. That is the `unadopted` result `resolveStanding` returns when `AGENTS.md` does not link `.vh-adlc/maintenance.yaml` (`plugins/vh-adlc/scripts/maintenance/authority.ts:95-97`). AC-24 treats this case as `not-adopted`, not as a binding failure. It is the usual case for consumers in `check`: `gh api repos/michielvha/bg-remove/contents/AGENTS.md` returns 404, and onboarding "usually runs in `check`, because its own commit is what links the settings". If `check` reads only committed, linked rows, a keep-off row in such a consumer's `.vh-adlc/maintenance.yaml` is ignored. A kept-off setting that reads as on is then `already-on` with no reason, not `owner-choice-conflict`. A kept-off setting that reads as off is `not-changed` with `check-only` and makes the helper exit 1. AC-15 and AC-17 apply to any setting "listed in `security_settings_keep_off`" in any mode, and the summary says the owner decisions list names "keep-off settings found on". Both readings fit the Design's text, so the implementation reviewer cannot decide the AC-15 and AC-17 verdicts for this case.
PROPOSAL: State where `check` reads keep-off rows when the committed settings are unlinked or absent: from the working tree, as on a binding failure, or nowhere. Add an AC-17 fixture with an unlinked committed settings file and a keep-off row for a setting that reads as on. It passes on the outcome you choose.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Design (Procedure changes: authority row) and AC-11
EVIDENCE: The Q74 fold changed AC-11 and the mode bullet to "among maintenance runs only a full sweep whose request has `authorized_sweep` true may apply, onboarding applies only as the committed settings decide". The Design's authority row bullet still says "a maintenance sweep or onboarding may enable these settings ... A request with a flag that selects `check`, a request without `authorized_sweep` true, and a pull-request scope each give `check`." An onboarding request never carries `authorized_sweep` ("Onboarding has no recorded maintenance request"). Read literally, the row the Design describes therefore makes onboarding `check`, while AC-11 requires the same row to say onboarding applies as the committed settings decide.
PROPOSAL: Scope the authority row's `authorized_sweep` and pull-request sentence to maintenance runs, matching the reworded AC-11 clause.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Design (Helper), AC-24 and Test Plan (AC-24)
EVIDENCE: The Design says that when `apply` "cannot read its `--run-id` (missing, mismatched or broken run), it makes no write and exits nonzero naming the run". AC-24 says the same for a `--run-id` that "cannot be read". The proof's eighth `apply` fixture covers only "a `--run-id` that does not exist". `readRun` rejects a missing run, an identity mismatch and a broken event chain separately (`plugins/vh-adlc/scripts/maintenance/journal.ts:171-185`). Suppose an implementation checks only that the run directory exists and then reads the header's request without validating the chain. It passes the eighth fixture and still applies under a corrupt or forked run. A passing subset never upgrades a composite criterion.
PROPOSAL: Add an `apply` fixture whose run has a broken or noncontiguous event chain, or a mismatched identity. It passes when no write is recorded and the exit is nonzero naming the run.

### R-28

FINDING: F-01
KIND: factual
SEVERITY: nit
WHERE: Acceptance Criteria (AC-17) and Test Plan (AC-17)
EVIDENCE: The Q75 fold adds this to AC-17 (lines 769-772): "including when the committed settings are unlinked or absent and the row is in the working tree's settings". The Design (lines 366-368) says that when "the binding resolves but the committed settings are unlinked or absent, `check` also reads keep-off rows from the working tree". `resolveStanding` reaches that state on three separate paths. At line 96 it returns when there is no committed `AGENTS.md`, and also when `AGENTS.md` does not link `.vh-adlc/maintenance.yaml`. At line 98 it returns when `AGENTS.md` links the file but the file is not at the commit (`plugins/vh-adlc/scripts/maintenance/authority.ts:96`, `:98`). The new AC-17 proof (line 861) covers only "a resolved binding whose `AGENTS.md` does not link the settings". It also does not say the keep-off row exists only in the working tree. Suppose an implementation reads rows from an unlinked but committed `.vh-adlc/maintenance.yaml`, or falls back only when `AGENTS.md` exists without the link. It passes that fixture whenever the committed file and the working tree hold the same row. It would still miss the case where the file is absent, which is the bg-remove case: `gh api repos/michielvha/bg-remove/contents/AGENTS.md` and `.../contents/.vh-adlc` both return 404 today. A passing subset never upgrades a composite criterion.
PROPOSAL: In the AC-17 fixture, put the keep-off row only in the working tree. Add a second `check` fixture with no committed `AGENTS.md` or settings file, or one whose `AGENTS.md` links a settings file that was never committed. Each passes with the same `owner-choice-conflict` outcome.

### R-29

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan (AC-24), Acceptance Criteria (AC-24) and Design (Helper)
EVIDENCE: Q75 says that when the binding resolves but the committed settings are unlinked or absent, `check` "also reads keep-off rows from the working tree" (Design, Helper, about lines 366-368 at cb5444a). The Design also says that `apply`, when it refuses, "reports its entries exactly as `check` would". A refusing `apply` therefore has to load the working-tree settings in exactly this state. AC-24 says the helper's `apply` "makes no write ... when the bound committed settings do not adopt `security_settings: apply`", and unlinked or absent settings fall under that. The Test Plan row for AC-24 (line 868) has no helper `apply` fixture for this state. Fixture (1) is "committed settings that do not adopt `apply`" and does not say what the working tree holds. The later sentence "Further fixtures where `apply` is only in the working tree, only on an unmerged branch, or in a settings file `AGENTS.md` does not link: each gives `check` with `not-adopted`" sits between two "A mode fixture" sentences and names no command. The matching AC-24 sentence (line 821) names none either. An implementer can meet that sentence with `security-settings-mode` fixtures alone. The tenth fixture covers a committed `security_settings: maybe` beside a working tree that adopts `apply`. Nothing covers an unlinked or absent committed file beside a working tree that adopts `apply`. That is the onboarding case, since "its own commit is what links the settings". Suppose a helper `apply` reads adoption from the same working-tree fallback that `check` now uses for keep-off rows. It passes all eleven `apply` fixtures, but it writes in a consumer that never committed the opt-in. Only the skill's mode call would then stop the write, which Q55 says must not be the only guard. A passing subset never upgrades a composite criterion.
PROPOSAL: Name the command in the "Further fixtures" sentence, or add a helper `apply` fixture for each case: no committed `AGENTS.md` or settings file, or an `AGENTS.md` that does not link the settings, beside a working tree that adopts `security_settings: apply`. Each fixture passes when no write is recorded, the mode is `check` with `not-adopted`, and the entries match `check` with the same binding.

### R-30

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria (AC-24) and Test Plan (AC-24)
EVIDENCE: The R-29 fold widened AC-24 (lines 824-827 at 5ed12e1). It now reads: "A value of `apply` present only in the working tree, only on an unmerged branch, or in a settings file `AGENTS.md` does not link gives `check`, both from `security-settings-mode` and from the helper's `apply`, which never reads adoption from the working tree." The Test Plan row for AC-24 (line 872) gives `security-settings-mode` fixtures for all three cases. It adds only "Two more helper `apply` fixtures, one with no committed `AGENTS.md` or settings file and one whose committed `AGENTS.md` does not link the settings". No helper `apply` fixture covers adoption committed only on an unmerged branch. In that case the checkout's HEAD or branch adopts `apply`, and the `--default-commit` tip of `--default-branch` does not. The ninth `apply` fixture covers only a `--default-commit` that differs from `origin/<branch>`. Fixture (1), "committed settings that do not adopt `apply`", does not say that HEAD differs from the default commit. No helper `apply` fixture covers the third unlinked or absent path that R-28 named either: `AGENTS.md` links `.vh-adlc/maintenance.yaml`, but that file was never committed (`plugins/vh-adlc/scripts/maintenance/authority.ts:98` returns `unadopted` when `raw === null`). AC-17 has a `check` fixture for this path, but `apply` has none. Suppose a helper `apply` reads adoption from `HEAD:` instead of the bound default commit, or reads a linked file from the working tree when its committed blob is missing. It passes every listed `apply` fixture and still writes where the default branch never adopted the opt-in. Only the skill's mode call would stop it, and Q55 says that call must not be the only guard. A passing subset never upgrades a composite criterion, so the implementation reviewer could only mark AC-24 `untested`.
PROPOSAL: Add helper `apply` fixtures for adoption committed only on a checked-out unmerged branch and for an `AGENTS.md` that links a settings file that was never committed. Each sits beside a working tree that adopts `apply` and passes when no write is recorded, the mode is `check` with `not-adopted`, and the entries match `check` with the same binding. Alternatively, narrow the AC-24 sentence so that it claims the helper's `apply` behaviour only for the cases the fixtures prove.

### R-31

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Helper; Renovate and Dependabot detection; Rules applied before any write; Collector) and Scope
EVIDENCE: Maintenance supports GitHub hosts other than github.com. `plugins/vh-adlc/scripts/maintenance/settings.ts` `loadSettings` fails only when a "nonstandard GitHub hostname requires explicit identity". `references/maintenance-settings.md:16` documents the `hostname` setting. `scripts/github-read.ts:18` maps a non-github.com hostname to its own API host. The branch helper passes `--hostname target.hostname` on every `gh api` call (`scripts/branches/branches.ts:217`, `:279`). At cfa455e the document never says "hostname", Enterprise Server or which host the helper calls (`grep -i hostname` over Context to Test Plan finds nothing). Its rules use github.com facts. Renovate detection "looks only for the managed Renovate App's `app/renovate` login". The private-repository rules (rule 2 and the collector's `not-free-on-private`) apply github.com plan terms from the cited "About GitHub Advanced Security" page and from docs#30, which says it was "written for the `michielvha` and `vhco-pro` accounts". Take a consumer on another host that runs self-hosted Renovate without a config file (bg-remove shows Renovate can open pull requests without one) and has a `.github/dependabot.yml`. That host has no `app/renovate` author, so the "no signal, configured" row writes Dependabot security updates beside Renovate. That is the duplicate pull requests the goal rules out. The collector rule could also mark such a host's private code scanning gap `complete-unavailable` because of plan terms that do not apply to it. Every criterion can be ticked with github.com fixtures while this case stays undefined.
PROPOSAL: State the helper's host handling. Either limit `apply`, the Renovate detection rows and the `not-free-on-private` collector rule to github.com and give any other host `check` with a named reason, with one fixture to prove it, or raise the non-github.com behaviour as an open question.

### R-32

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design (Rules applied before any write, rule 2; Helper) and Scope, compared with AC-27 and its Test Plan row
EVIDENCE: After the Q79 fold, Scope (line 297 at 202642a) says: "github.com only for writes and plan rules. On any other host, `apply` is refused with mode reason `not-github-com`, and the `not-free-on-private` rule does not apply, since the Renovate App login and the plan terms are github.com facts." The fold added the host condition only to the collector rule ("and the repository is on github.com"). The helper's rule 2 (line 437) still has no host condition. It makes private and internal secret scanning and push protection `unavailable` with `not-free-on-private`, and it gives the `code_scanning` entry `unavailable` with the same reason. The Helper output paragraph (line 390) also adds that entry on every private and internal repository. On another host, the helper's `check` therefore applies the github.com plan terms that Scope says do not apply. In the same sweep report, the helper's table would list `code_scanning` as `unavailable` with `not-free-on-private`, while the collector leaves that surface incomplete. AC-27 covers only `security-settings-mode`, the helper's `apply` refusal and the collector. Its Test Plan row has no private-repository helper fixture on `ghe.example.com`. Every criterion can be ticked while the helper still applies rule 2 off github.com.
PROPOSAL: Limit rule 2 and the `code_scanning` entry to github.com, and say what those entries show on another host (for example `unknown` or `not-changed` with `check-only`). Add to AC-27, and to its proof, a private admin helper fixture on `ghe.example.com` that has no `not-free-on-private` entry.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design (Helper; Reads and writes) and Test Plan (AC-27)
EVIDENCE: R-31 asked the document to "State the helper's host handling". The fold defines a mode reason, but it still does not say which API host the helper calls. The helper synopsis has no host flag. "Reads and writes" (line 412) says only "All through `gh api`". Existing plugin code passes the host explicitly on every call. The branch helper uses `gh api --hostname this.hostname` (`plugins/vh-adlc/scripts/branches/branches.ts:80`, `:85`, `:217`), and `ghRead` builds `["gh", "api", "--hostname", hostname, ...]` (`plugins/vh-adlc/scripts/github-read.ts:54`). The host comes from the validated origin (`plugins/vh-adlc/scripts/maintenance/settings.ts:63-75`). Without `--hostname`, `gh api` uses `GH_HOST` or github.com. A helper written to this text could therefore run `check` against github.com for a `ghe.example.com` consumer and report another repository's settings. A github.com consumer with `GH_HOST` set could also have its `apply` writes sent to another host. The AC-27 proof compares the helper's refused `apply` with `check` "with the same binding", and both would read the same wrong host, so the proof does not catch this. The Helper section also lists `apply`'s own refusal conditions (adoption and committed scope, plus run rules with `--run-id`, around line 359). It does not include the host, but Scope and AC-27 require that refusal without a run, as in onboarding.
PROPOSAL: State that every helper read and write passes `--hostname` with the validated origin host. Add `not-github-com` to the Helper section's list of `apply` refusals that apply with or without `--run-id`. In the AC-27 proof, assert that every recorded `gh` call carries `--hostname ghe.example.com`.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Frontmatter goal and Context (Owner summary)
EVIDENCE: The goal says "Every full authorized maintenance sweep and onboarding by a consumer that opts in turns on, in each repository its committed settings name and except what its keep-off list names, Dependabot alerts ...". The summary (line 50) says that with `security_settings: apply` "it turns these on when off in every covered repository those committed settings name". Q68 put the committed-scope and keep-off limits into the goal. Q79 adds another limit: on any host other than github.com, an opted-in consumer always gets `check` with `not-github-com`. Neither the goal nor the owner summary mentions this, so both promise writes that Scope and AC-27 rule out for those consumers.
PROPOSAL: Add "on github.com" to the goal's outcome. Add one sentence to the owner summary saying that other hosts are check-only, with the reason `not-github-com`.

### R-33

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria (AC-24) and Design (Procedure changes, `security-settings-mode` bullet), compared with AC-27 and the ordered mode reasons
EVIDENCE: The Q79 and Q80 folds added `not-github-com` to the ordered mode reasons (line 622 at 20498af) and to AC-27 (line 871): "When the maintenance settings' `hostname` is not github.com, `security-settings-mode` prints `check` with `not-github-com` even when the committed settings adopt `apply`". The two sentences that define when the command prints `apply` were not updated. AC-24 (lines 838-843) lists the request flags, non-adoption, a missing `authorized_sweep`, a pull-request scope and a target outside the run's scope, and then says "otherwise it prints `apply`, also with no recorded request." The Design bullet (lines 604-610) lists the same conditions and then says "Otherwise it is `apply`. So among maintenance runs only a full authorized sweep writes". Neither sentence has the host condition. Read literally, AC-24 requires `apply` for an adopted, unrestricted consumer on `ghe.example.com`, and AC-27 requires `check` for the same consumer. AC-24 is a composite criterion, so an implementation reviewer who reads its "otherwise" clause literally cannot mark both criteria met. An implementer who works from the Design bullet's condition list can also leave the host out of the mode function.
PROPOSAL: Add "or when the maintenance settings' `hostname` is not github.com" to AC-24's list of `check` conditions and to the Design bullet before "Otherwise it is `apply`". Alternatively, reword both "otherwise" clauses to say "when none of the ordered mode reasons applies".

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Design (Renovate and Dependabot detection)
EVIDENCE: Line 503 says "Renovate has no signal only when every Renovate lookup succeeded and none matched. Any failed Renovate lookup with no match elsewhere counts as failed, as does a failed Dependabot config lookup." For setting reads, rule 4 explicitly excludes "the 404 that means off". The document never says what counts as a successful lookup with no match. On GitHub, the contents API answers 404 for an absent file, and R-1's evidence (line 979 region) records "the contents API returned 404 for every Renovate config location" on bg-remove. If an implementation treats that 404 as a failed lookup, every repository without a Renovate config file gets `renovate-detection-failed` and exit 1, and security updates are never enabled. The fixtures leave the fake's response for an absent file to the implementer, so a fake that answers absent files differently would let AC-03 and AC-08 pass anyway. AC-12's live run also misses this, because bg-remove matches on its `app/renovate` pull requests first. The document also does not say that "the default branch" for these lookups is the target repository's own `default_branch` from `repos/{r}`, not the helper's `--default-branch`, which binds the consumer checkout.
PROPOSAL: State that a 404 from a config-file lookup on the target's default branch means the file is absent, and counts as a successful lookup with no match. Add that the AC-03 and AC-08 fakes answer absent files with 404, as GitHub does.

### R-34

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design (Renovate and Dependabot detection) and Test Plan (AC-01, AC-03, AC-04 and AC-02, AC-08 rows)
EVIDENCE: The Q81 fold (line 506 at 07b95a5) says: "The default branch for these lookups is the target repository's own `default_branch` from `repos/{r}`, not the helper's `--default-branch`, which binds the consumer checkout. A 404 from a config-file lookup there means the file is absent." No criterion or fixture checks which ref the lookups use. Every helper fixture in rows 889 to 912 is a single repository whose default branch is never named. In those fixtures the consumer's `--default-branch` and the target's `default_branch` are the same, or the fake ignores `ref`. Suppose an implementation passes `ref=<--default-branch>`, and a non-origin target's default branch differs, for example `master` with a `.github/dependabot.yml`. GitHub then answers 404 for every config-file lookup. Under the new rule that 404 means absent, so the entry is `left-off` with `renovate-unknown` and exit 0. The report shows a deliberate choice, but Dependabot security updates were never enabled where Dependabot is the updater, which the goal and AC-03 require. A Renovate config file on that branch would also be missed. Every listed fixture still passes.
PROPOSAL: Add a helper fixture whose target default branch (for example `master`, holding `.github/dependabot.yml`) differs from the `--default-branch` passed, with a fake that answers a contents lookup on any other ref with 404. It passes when security updates are `enabled`. Alternatively, have the fake reject any contents lookup whose `ref` is not the target's `default_branch`.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Test Plan (AC-08)
EVIDENCE: Since Q81, a 404 from a config-file lookup counts as a successful lookup with no match (line 506 to 509). The AC-08 row (line 894) still describes its fixtures only as "every Renovate lookup fails", "only the `renovate.json` lookup fails" and "the `.github/dependabot.yml` lookup fails", with no status. The fake described in line 889 "answers a lookup of an absent file with 404". If a fixture makes a lookup "fail" with 404, the Design requires no signal, not the `renovate-detection-failed` or `dependabot-detection-failed` outcome that the row expects. The row and the Design then contradict each other, and the outcome depends on which status the implementer picks.
PROPOSAL: State the failing status in the AC-08 fixtures, for example 500 or a network error, and say that a 404 is not a failure for these lookups.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Acceptance Criteria (AC-24) and Test Plan (AC-24, AC-27)
EVIDENCE: The Q81 fold added "or when the maintenance settings' `hostname` is not github.com" to AC-24's list of `check` conditions (line 850). AC-24's Test Plan row (line 907) has no fixture for that condition, and the words "hostname", "github.com" and "ghe." do not appear in it. The only `not-github-com` mode fixture is in the AC-27 row (line 909), whose first column names only AC-27. AC-24 is a composite criterion, and a passing subset never upgrades one. An implementation reviewer who works from AC-24's own row would find no check for this new clause.
PROPOSAL: Add AC-24 to the first column of the AC-27 row, or add a sentence to the AC-24 row naming the AC-27 `security-settings-mode` fixture that prints `check` with `not-github-com`.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Acceptance Criteria (preamble, AC-01, AC-03 to AC-05, AC-09, AC-13)
EVIDENCE: The preamble (line 686) says: "Each criterion covers the entries no earlier rule under 'Rules applied before any write' decides, with every read and write succeeding, unless it names another case." The helper's `apply` refusals are mode reasons, not numbered rules: `not-github-com`, `not-adopted`, `not-in-committed-scope` and the run restrictions (Design, Helper: "These are mode reasons, not entry reasons"). AC-01 (line 689) reads "After `apply` on an unarchived repository where the caller is admin, Dependabot alerts are off ... the output lists `dependabot_alerts` as `enabled`" with no host or adoption condition. AC-27 says that on another host "the helper's `apply` makes no write", and AC-24 says it makes no write when the committed settings do not adopt it. Read literally, AC-01 and the other write criteria claim writes in exactly the cases that AC-24 and AC-27 forbid.
PROPOSAL: Extend the preamble to say that criteria about `apply` also assume no mode reason refuses it, that is github.com, committed adoption naming the target, and no restricting run.

### R-35

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design (Renovate and Dependabot detection; Reads and writes) and Test Plan (AC-02)
EVIDENCE: Line 501 to 503 say detection matches "a pull request in any state authored by `app/renovate`; or an open issue authored by `app/renovate`" and "looks only for the managed Renovate App's `app/renovate` login". "Reads and writes" (line 423) says every call goes "through `gh api`", but its list names only the settings endpoints. It names no endpoint for the pull request and issue lookups. The login form depends on the endpoint. On 2026-11-10, `gh api 'repos/michielvha/bg-remove/pulls?state=all&per_page=50' --jq '.[] | select(.user.type=="Bot") | [.number,.user.login,.user.type]'` gave `26 renovate[bot] Bot`, `25 renovate[bot] Bot` and `24 renovate[bot] Bot`. `gh api 'repos/michielvha/bg-remove/issues?state=open'` also gave `renovate[bot]`. Only the search API accepts `author:app/renovate`: `search/issues?q=repo:michielvha/bg-remove+is:pr+author:app/renovate` returned total_count 24. The plugin already maps both forms to one name with `normalizeLogin` (`plugins/vh-adlc/scripts/maintenance/settings.ts:51-52`), but the document does not mention it. Suppose an implementation reads `repos/{r}/pulls` and compares `user.login` with the literal `app/renovate`. It never finds Renovate from pull requests or the Dependency Dashboard issue. On a repository that has a `dependabot.yml` and whose only Renovate signal is its pull requests, as on bg-remove, it would then turn on Dependabot security updates beside Renovate. That is the duplicate pull requests the goal rules out. The AC-02 fixtures are built from the document's `app/renovate` wording, and the fake's response shape is left to the implementer, so every Bun proof can pass anyway. Only the final live AC-12 run would catch it.
PROPOSAL: Name the endpoints used for the pull request and issue lookups and the login each returns (`renovate[bot]` with `user.type` Bot in REST, or `author:app/renovate` in search). Have the AC-02 fake return the REST shape that GitHub returns.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Test Plan (AC-08) compared with Design (Renovate and Dependabot detection)
EVIDENCE: The Q82 fold added this to the AC-08 row (line 899): "every Renovate lookup fails with 500; ... A 404 is not a failure for these lookups." In that row, "these lookups" covers every Renovate lookup, including the pull request and issue lookups. The Design (line 510 to 513) treats only "a 404 from a config-file lookup" as a successful lookup with no match. It counts "any failed Renovate lookup" as failed. So the row says a 404 from the pull request or issue lookup is not a failure, while the Design says it is one.
PROPOSAL: Change the row to "A 404 from a config-file lookup is not a failure".

## Sources

- [About GitHub Advanced Security](https://docs.github.com/en/get-started/learning-about-github/about-github-advanced-security): the dependency graph and Dependabot alerts are in all plans; code scanning and secret scanning are on for public repositories by default and need GitHub Code Security or Secret Protection, on a Team or Enterprise plan, for private and internal repositories. Read 2026-11-10.
- [Dependabot alerts](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-alerts): repository administrators can enable alerts, and GitHub then generates the dependency graph and alerts. Read 2026-11-10.
- [Dependabot security updates](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-security-updates): available where the dependency graph and alerts are enabled; when on, Dependabot tries to open a pull request for every open alert with a patch. Read 2026-11-10.
- [Configuring default setup for code scanning](https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/configure-code-scanning/configuring-default-setup-for-code-scanning): switching to default setup disables an existing CodeQL workflow file and blocks CodeQL analysis uploads. Read 2026-11-10.
- [vhco-pro/docs#30, `conventions/repository-security.md` at 4b2198d](https://github.com/vhco-pro/docs/blob/4b2198d/conventions/repository-security.md): the proposed convention, written for the `michielvha` and `vhco-pro` accounts. Public repositories get the dependency graph, Dependabot alerts, secret scanning and push protection, plus CodeQL and Scorecard through reusable workflows in `vhco-pro/.github`. Private repositories get the dependency graph and Dependabot alerts, and reports list the rest as unavailable. Renovate repositories keep Dependabot security updates off; they are turned on only with a `.github/dependabot.yml` or `.github/dependabot.yaml` and no sign of Renovate (changed in `89d567a` for Q13). Open, not merged, read 2026-11-10.
- [vhco-pro/docs#30, `guides/onboard-a-repository.md` at 4b2198d](https://github.com/vhco-pro/docs/blob/4b2198d/guides/onboard-a-repository.md): the onboarding commands; `GET vulnerability-alerts` returns 204 when alerts are on and 404 when off; "With the owner's agreement, turn on Dependabot alerts in every repository"; security updates only with `.github/dependabot.yml` or `.github/dependabot.yaml` and no sign of Renovate (since `106ecfb`). Open, not merged, read 2026-11-10.
- [GitHub REST API description, `api.github.com.json`](https://github.com/github/rest-api-description/blob/main/descriptions/api.github.com/api.github.com.json): `GET /repos/{owner}/{repo}/vulnerability-alerts` answers 204 when alerts are enabled and 404 when not; `GET /repos/{owner}/{repo}/automated-security-fixes` answers 200 with `enabled` and `paused` booleans, or 404 when Dependabot is not enabled; the `security-and-analysis` schema includes `advanced_security` and `code_security`. Read 2026-11-10.
- [Renovate configuration options](https://docs.renovatebot.com/configuration-options/): the documented config file locations, including a `renovate` section in `package.json`, and that `vulnerabilityAlerts` reads GitHub's alerts only when the dependency graph and Dependabot alerts are enabled. Read 2026-11-10.
