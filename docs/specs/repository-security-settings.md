---
status: draft
status_description: "Q12 to Q18 answered with every recommendation; a new spec review is due. Implementation waits for vhco-pro/docs#30 to merge."
issue: null
goal: "Every maintenance sweep and onboarding leaves a repository with each GitHub security setting its plan offers for free turned on, without duplicating Renovate's pull requests, and reports what it changed."
covers:
  - AGENTS.md
  - plugins/vh-adlc/knowledge.md
  - plugins/vh-adlc/plugin.json
  - plugins/vh-adlc/.claude-plugin/plugin.json
  - plugins/vh-adlc/scripts/security-settings/
  - plugins/vh-adlc/scripts/maintenance/collect.ts
  - plugins/vh-adlc/scripts/maintenance/settings.ts
  - plugins/vh-adlc/references/security-settings.md
  - plugins/vh-adlc/references/maintenance.md
  - plugins/vh-adlc/references/maintenance-settings.md
  - plugins/vh-adlc/references/authority.md
  - plugins/vh-adlc/references/loop.md
  - plugins/vh-adlc/references/lifecycle.md
  - plugins/vh-adlc/skills/vh-adlc-maintenance/SKILL.md
  - docs/user-guides/workflows.md
  - tests/vh-adlc/security-settings/
  - tests/vh-adlc/maintenance/
---

# Plan: Repository security settings

Maintenance sweeps and onboarding turn on the GitHub security settings a repository's plan includes
at no cost, instead of only reporting that they are off. Dependabot security updates stay off where
Renovate opens the fix pull requests.

## Context

### Owner summary

A sweep on `michielvha/bg-remove` found Dependabot alerts off, so it recorded a coverage gap and
Renovate, which reads the alerts, opened no security fixes. Once the owner enabled them, GitHub
listed 47 alerts and Renovate opened two security pull requests.

A new helper makes that step automatic. Every maintenance sweep runs it before collecting alerts,
and so does onboarding. It turns on what is off and free:

- Dependabot alerts, with the dependency graph, in every repository, private ones too.
- On public repositories, secret scanning and push protection.
- Dependabot security updates only where the repository has a `dependabot.yml` and no sign of
  Renovate: a config file, a pull request or a Dependency Dashboard issue from `app/renovate`. With
  no signal either way it leaves them off, so the two bots never open competing pull requests.

The sweep report gets a section with each setting's state and reason. Its owner decisions list
names Dependabot security updates left on beside Renovate, and keep-off settings found on. On
private repositories it lists code scanning as unavailable for the plan, not as a coverage gap.

The helper never turns a setting off. It skips public-only settings on private repositories,
writes nothing to archived ones, and reports a setting it cannot read as `unknown`. A
per-repository list in `.vh-adlc/maintenance.yaml` stops it from enabling chosen settings, and a
request that forbids live changes runs a read-only check. After a clean run, a second run changes
nothing; a failed write is retried next time.

The rules follow the convention proposed in vhco-pro/docs#30, now changed to the same
security-updates rule. CodeQL and Scorecard come from its reusable workflows, so the helper never
turns on CodeQL default setup. Implementation waits for docs#30 to merge, then moves both docs pins
with a plugin minor version bump.

These owner decisions widen the authority table, which today lets vh-adlc change only
merged-branch deletion, with the owner's yes.

Proof is planned, not observed: Bun tests against a fake `gh` for each repository shape, and a live
sweep of bg-remove. No live run shows a sweep enabling alerts and collecting them in the same run.
Reviews R-1 and R-2 found nothing blocking; the owner answered their questions, and a new review is
due. Acceptance authorizes tasks, implementation on a feature branch, the pin move, the version
bump and that live sweep. A release and changes to any other repository outside a sweep or
onboarding need separate approval.

### Background

The maintenance collector reads open Dependabot and code scanning alerts per repository
(`plugins/vh-adlc/scripts/maintenance/collect.ts:108-115`, `:240-241`). An unmatched 403 or 404
leaves that surface incomplete (`plugins/vh-adlc/references/maintenance.md:80`). Nothing in the
plugin changes a security setting. The only repository setting it writes is merged-branch deletion,
through `autoDelete` (`plugins/vh-adlc/scripts/branches/branches.ts:273-284`), and only with the
owner's yes (`plugins/vh-adlc/references/authority.md:32`, `plugins/vh-adlc/references/loop.md:70-73`,
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

vhco-pro/docs#30 (open, head `89d567a`) proposes `conventions/repository-security.md`. Its feature
list by visibility and its updater rule are the ones this design applies; see Sources. It is not yet
in the docs revision this repository pins (`a4e3d592`), so this document cites the PR.

The configured bot authors default to `renovate` and `dependabot`
(`plugins/vh-adlc/scripts/maintenance/settings.ts:109`).

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

## Scope

In scope:

- A helper that checks and applies repository security settings for one repository, with JSON and
  Markdown output.
- Dependabot alerts with the dependency graph, wherever the plan offers them.
- Dependabot security updates where Dependabot is configured and Renovate shows no signal.
- Secret scanning and push protection on public repositories.
- A read-only code scanning entry that marks private and internal repositories as unavailable for
  the plan, and the collector rule that records their code scanning surface the same way.
- A per-repository keep-off list in `.vh-adlc/maintenance.yaml`.
- Running the helper in every maintenance sweep before collection and during onboarding, with the
  outcome in the sweep report or the onboarding report.
- Moving the `AGENTS.md` pin and the plugin pin in `plugins/vh-adlc/knowledge.md` to the revision
  where vhco-pro/docs#30 merged, with a plugin minor version bump in both `plugin.json` files.
- The authority row, maintenance skill step, onboarding text, reference pages and user-guide section
  for the above.

Out of scope:

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
`plugins/vh-adlc/.claude-plugin/plugin.json`, so every consumer resolves the page. Sweeps and
onboarding do not request the page through `vh-adlc knowledge`, so a consumer whose own older pin
lacks it still sweeps normally. If docs#30
closes unmerged or changes the rules this design applies, the document returns to the owner before
implementation continues.

### Helper

New helper `plugins/vh-adlc/scripts/security-settings/`, shaped like the branch helper's `auto-delete`
(`plugins/vh-adlc/scripts/branches/branches.ts:273-284`):

```text
bun <plugin>/scripts/security-settings/cli.ts check --repo PATH [--repository OWNER/NAME] [--format json|markdown]
bun <plugin>/scripts/security-settings/cli.ts apply --repo PATH [--repository OWNER/NAME] [--format json|markdown]
```

`--repo` is the checkout whose `.vh-adlc/maintenance.yaml` applies. `--repository` selects the target
and defaults to that checkout's validated origin. `check` only reads. `apply` reads, writes each
setting that is off and free, then reads that setting again.

The default JSON output holds the repository, its visibility, whether it is archived, the caller's
admin permission, the Renovate and Dependabot detection results with their evidence, and one entry
for each of `dependabot_alerts`, `dependabot_security_updates`, `secret_scanning` and
`secret_scanning_push_protection`. The `dependabot_alerts` entry covers the dependency graph, which
GitHub generates when alerts are enabled. On private and internal repositories the output also has a
read-only `code_scanning` entry. `--format markdown` prints the same data as a
`## Repository security settings` section with one table row per entry, followed by an
"Owner decisions" list of every entry with reason `renovate-overlap` or `owner-choice-conflict`, or
"None." when there is none.

Each entry has one state:

| State | Meaning |
| --- | --- |
| `already-on` | Read as on before any write; reason `renovate-overlap` when it is Dependabot security updates and Renovate is present, or `owner-choice-conflict` when the keep-off list names it |
| `enabled` | Off before, written, and read back as on |
| `left-off` | Deliberately not enabled; reason `renovate-present`, `renovate-unknown`, `renovate-detection-failed` or `owner-choice` |
| `unavailable` | Not free for this repository; reason `not-free-on-private` or `archived` |
| `not-changed` | Off and free, but not written or not read back as on; reason `check-only`, `alerts-off` or `api-error` with the HTTP status |
| `unknown` | Not read; reason `needs-admin`, or `api-error` with the HTTP status or error when a read failed |

The exit code is 0 when no entry is `not-changed` or `unknown`, and 1 otherwise.

### Reads and writes

All through `gh api`:

- `repos/{r}`: `visibility`, `archived`, `permissions.admin` and `security_and_analysis`.
- Dependabot alerts: `GET` and `PUT repos/{r}/vulnerability-alerts`.
- Dependabot security updates: `GET` and `PUT repos/{r}/automated-security-fixes`.
- A 404 from `GET vulnerability-alerts` or `GET automated-security-fixes` means the setting is off.
- Secret scanning and push protection: `PATCH repos/{r}` with `security_and_analysis`.

Alerts are written and read back first. Security updates are tried only when alerts read back as on;
otherwise their entry is `not-changed` with reason `alerts-off`. The helper calls no `code-scanning`
endpoint.

### Rules applied before any write

- When `permissions.admin` is false, the helper makes no admin-only read and no write, and every
  entry is `unknown` with reason `needs-admin`.
- On an archived repository, every setting that is off is `unavailable` with reason `archived`, and
  the helper makes no write.
- On a private or internal repository, secret scanning and push protection are `unavailable` with
  reason `not-free-on-private`, unless the first read shows them on, which makes them `already-on`.
  The `code_scanning` entry is `unavailable` with the same reason. The helper calls none of their
  write endpoints there.
- A setting listed for the target repository under `security_settings_keep_off` is never written.
  It is `left-off` with reason `owner-choice`, or `already-on` with reason `owner-choice-conflict`
  when the first read shows it on. The listed reason appears in the output.
- A read that fails, other than a 404 that means off, gives `unknown` with reason `api-error` and
  the status or error, and the helper makes no write for that setting.
- A write that fails, or a setting not read back as on, gives `not-changed` with reason `api-error`
  and the status. The helper still processes the remaining settings.

When several rules apply to one entry, the first in this order decides its state and reason:
`archived`, `not-free-on-private`, `needs-admin`, `owner-choice` or `owner-choice-conflict`, the
Renovate and Dependabot rules below, `check-only`, `alerts-off`, `api-error`. Under `check`, an off
security-updates entry that `apply` would try is `not-changed` with `check-only`, even while alerts
are off.

### Renovate and Dependabot detection

Renovate is present when any of these match: a config file on the default branch at a location
Renovate documents (`renovate.json`, `renovate.jsonc`, `renovate.json5` at the root and under
`.github/` and `.gitlab/`, `.renovaterc`, `.renovaterc.json`, `.renovaterc.jsonc`,
`.renovaterc.json5`, or a `renovate` key in the root `package.json`); a pull request in any state
authored by `app/renovate`; or an open issue authored by `app/renovate` whose title contains
"Dependency Dashboard". The output names the matched path, pull request or issue.

Dependabot is configured when `.github/dependabot.yml` or `.github/dependabot.yaml` exists on the
default branch.

For `dependabot_security_updates`:

| Renovate | Dependabot | Entry |
| --- | --- | --- |
| present | any | `left-off` with `renovate-present`, or `already-on` with `renovate-overlap` |
| no signal | configured | written, then `enabled` or `already-on` |
| no signal | not configured | `left-off` with `renovate-unknown` |
| lookup failed with no match | any | `left-off` with `renovate-detection-failed` and the error |

The `renovate-unknown` row means a new repository the Renovate App covers gets no duplicate pull
requests before its first Renovate pull request (Q6). docs#30 states the same rule since `89d567a`
(Q13).

### Collector

`scripts/maintenance/collect.ts` already reads `repos/{r}` for each repository
(`plugins/vh-adlc/scripts/maintenance/collect.ts:215`). It also keeps the visibility from that read.
When the repository is private or internal and the code scanning alerts read fails with 403 or 404,
the surface is `complete-unavailable` with reason `not-free-on-private` and that status, with no
configured `surface_expectations` entry needed. A successful read still wins.
`references/maintenance.md:80` changes to name this rule beside the configured exact match.

### Settings

`references/maintenance-settings.md` and `scripts/maintenance/settings.ts` gain
`security_settings_keep_off`: rows of `{repository, settings, reason}`, where `repository` is in
declared scope, `settings` lists names from the four writable entries, and `reason` is required
text. Unknown setting names and duplicate repositories fail visibly, as for the other fields.

### Procedure changes

- `references/security-settings.md` (new) documents the commands, states, reasons, detection rules,
  keep-off list, precedence and authority. For which features a repository should have, it links to
  `conventions/repository-security.md` at the pinned docs revision instead of restating it.
- The maintenance skill gets a step before collection: run `apply` for each repository in scope, or
  `check` when the current request forbids live or remote changes, then collect, so alerts enabled in
  this run are collected in the same run. When alerts were enabled in this run, the report says the
  alert list may still be filling. The helper's owner decisions list goes into the report's owner
  decisions.
- `references/maintenance.md` adds the `## Repository security settings` section to the sweep report,
  taken from the helper's Markdown output.
- `references/authority.md` gets a row: a maintenance sweep or onboarding may enable these settings
  on a repository in its scope with `apply`. A current request that forbids live or remote changes
  wins, and the procedure then runs `check`. Nothing grants turning a setting off.
- `references/loop.md:70-73` and `references/lifecycle.md:64` add that onboarding runs `apply` and
  reports its output beside the merged-branch deletion check. Like that check, it is a repository
  change, not a commit, and never holds up the onboarding commit.
- `docs/user-guides/workflows.md` gets a section beside "Stale branches" describing the default and
  the manual commands. The merged-branch deletion text stays as it is.

## Acceptance Criteria

- [ ] AC-01: After `apply` on a repository where the caller is admin and Dependabot alerts are off,
      `GET repos/{r}/vulnerability-alerts` returns 204 and the output lists `dependabot_alerts` as
      `enabled`.
- [ ] AC-02: After `apply` on a repository with any documented Renovate config location, an
      `app/renovate` pull request, or an open `app/renovate` Dependency Dashboard issue, Dependabot
      security updates are still off and listed as `left-off` with reason `renovate-present` and the
      matched path, pull request or issue.
- [ ] AC-03: After `apply` on a repository with a `.github/dependabot.yml` or
      `.github/dependabot.yaml` and no Renovate signal, where the caller is admin, Dependabot security
      updates are on and listed as `enabled`. With neither file and no Renovate signal, they stay off
      and are listed as `left-off` with reason `renovate-unknown`.
- [ ] AC-04: After `apply` on a public repository where the caller is admin, secret scanning and push
      protection are each listed as `enabled` or `already-on`, and no call to any `code-scanning`
      endpoint was made.
- [ ] AC-05: After `apply` on a private or internal repository where every setting starts off,
      `dependabot_alerts` is read back on and listed as `enabled`, no write call was made for secret
      scanning or push protection, and those two entries and the `code_scanning` entry are
      `unavailable` with reason `not-free-on-private`. On an archived repository, `apply` makes no
      write call and every off setting is `unavailable` with reason `archived`.
- [ ] AC-06: When the caller is not admin, `apply` makes no write call and no admin-only read, lists
      every entry as `unknown` with reason `needs-admin`, and exits 1. `check` never makes a write
      call; it lists every off and free setting as `not-changed` with reason `check-only`, and exits
      1 when there is at least one.
- [ ] AC-07: `apply` never makes a write call that turns a setting off. After an `apply` that left no
      entry `not-changed` or `unknown`, a second `apply` on the same repository makes no write call
      and lists every setting as `already-on`, `left-off` or `unavailable`.
- [ ] AC-08: When every Renovate detection lookup fails, Dependabot security updates stay off and are
      listed as `left-off` with reason `renovate-detection-failed` and the error.
- [ ] AC-09: When one write fails, that setting is `not-changed` with reason `api-error` and the HTTP
      status, the remaining settings are still processed, and `apply` exits 1.
- [ ] AC-10: `--format markdown` prints a `## Repository security settings` section with one row per
      entry giving its state and reason, followed by an "Owner decisions" list holding exactly the
      entries with reason `renovate-overlap` or `owner-choice-conflict`, matching the JSON output for
      the same run.
- [ ] AC-11: `references/security-settings.md`, `references/authority.md`, `references/maintenance.md`,
      `references/maintenance-settings.md`, `references/loop.md`, `references/lifecycle.md`, the
      maintenance skill and `docs/user-guides/workflows.md` state: sweeps run `apply` before
      collection, or `check` under a restricting request; onboarding runs `apply`; the Renovate and
      Dependabot rules; the private, archived and keep-off rules; that `renovate-overlap` goes to the
      owner; the precedence order; and that no setting is ever turned off.
      `references/security-settings.md` links to `conventions/repository-security.md` at the plugin
      pin, and that revision contains the page.
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
- [ ] AC-15: A setting listed for the target repository in `security_settings_keep_off` is never
      written and is listed as `left-off` with reason `owner-choice` and the configured reason. A
      settings file naming an unknown setting fails visibly.
- [ ] AC-16: In a maintenance collection of a private or internal repository whose code scanning
      alerts read returns 403 or 404, the code scanning surface is `complete-unavailable` with reason
      `not-free-on-private` and that status, without a `surface_expectations` entry.
- [ ] AC-17: A setting listed in `security_settings_keep_off` that the first read shows on is not
      written, is listed as `already-on` with reason `owner-choice-conflict`, and appears in the
      Markdown owner decisions list.
- [ ] AC-18: When an admin read of a setting fails with a status other than a 404 that means off,
      that entry is `unknown` with reason `api-error` and the status, no write is made for it, the
      other settings are still processed, and `apply` exits 1. A 404 from `GET vulnerability-alerts`
      or `GET automated-security-fixes` is treated as off.
- [ ] AC-19: When several rules apply to one entry, its state and reason come from the first in the
      documented precedence order, and under `check` an off security-updates entry is `not-changed`
      with `check-only` even while alerts are off.
- [ ] AC-20: `AGENTS.md` and `plugins/vh-adlc/knowledge.md` pin the vhco-pro/docs revision where #30
      merged, both `plugin.json` files carry the same new minor version, and
      `vh-adlc knowledge --page conventions/repository-security.md` resolves the page at that pin.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01, AC-03, AC-04 | `bun test tests/vh-adlc/security-settings` with a fake `gh` that records every call, keeps settings state, and denies admin-only reads and rejects a security-updates write while alerts are off, as GitHub does. Fixture: public repository, admin, every setting off, `.github/dependabot.yml`, no Renovate. Pass: the four settings written once, read back on and reported `enabled`, and no `code-scanning` call recorded. A second fixture with no `dependabot.yml` passes when security updates are `left-off` with `renovate-unknown` and no `automated-security-fixes` write was recorded. |
| AC-02 | Same suite, one fixture per documented config location, one with a `renovate` key in `package.json`, one with only an `app/renovate` pull request, and one with only an open Dependency Dashboard issue. Pass: no write to `automated-security-fixes`, entry `left-off` with `renovate-present` and the matched evidence. |
| AC-05 | Same suite, fixtures: private repository, internal repository and archived public repository, each with every setting off. Pass: the private and internal runs record writes only to `vulnerability-alerts` and `automated-security-fixes`, `dependabot_alerts` is read back and `enabled`, and secret scanning, push protection and `code_scanning` are `unavailable` with `not-free-on-private`; the archived run records no writes and every entry is `unavailable` with `archived`. |
| AC-06 | Same suite, fixture with `permissions.admin: false` run with `apply`, and the first fixture run with `check`. Pass: zero write calls in both and no admin-only read in the first; entries `unknown` with `needs-admin`, or `not-changed` with `check-only`; exit code 1. |
| AC-07 | Same suite: a second `apply` on the first fixture's resulting state, after a first run with no `not-changed` or `unknown` entry, records no writes and reports only `already-on`, `left-off` or `unavailable`. Across every fixture, no recorded write has a body or endpoint that disables a setting. |
| AC-08 | Same suite, fixture where every detection call fails. Pass: no write to `automated-security-fixes`, entry `left-off` with `renovate-detection-failed` and the error. |
| AC-09 | Same suite, fixture where the `PATCH repos/{r}` write returns 422. Pass: secret scanning entries `not-changed` with `api-error` and 422, other settings still `enabled`, exit code 1. |
| AC-10 | Same suite: run the first fixture and the AC-14 fixture with both formats. Pass: the Markdown section has one row per JSON entry with the same state and reason, and its owner decisions list holds exactly the JSON entries with `renovate-overlap` or `owner-choice-conflict`, or "None." |
| AC-11, AC-20 | The reviewer reads the eight files, `AGENTS.md`, `plugins/vh-adlc/knowledge.md` and both `plugin.json` files at the implementation commit, confirms each listed rule is stated, the merged-branch deletion rule is unchanged, both pins name the docs#30 merge revision and both versions match a minor bump, then runs `vh-adlc knowledge --page conventions/repository-security.md` with the new plugin pin. Pass: the page resolves. |
| AC-12 | Manual: run a maintenance sweep of `michielvha/bg-remove` with the implemented plugin and read the saved report. Pass: the section shows the listed states. Limit: every setting there is already on or left off, so no live run shows a sweep enabling alerts and collecting them in the same run; the fake `gh` fixtures cover that path. |
| AC-13 | Same suite, fixture where the alerts write returns 403. Pass: no `automated-security-fixes` write recorded, entry `not-changed` with `alerts-off`, exit code 1. |
| AC-14 | Same suite, fixture with a Renovate config file and security updates already on. Pass: no write recorded, entry `already-on` with `renovate-overlap`, and the Markdown output lists it under owner decisions. |
| AC-15 | Same suite, fixture with a `.vh-adlc/maintenance.yaml` keep-off row for secret scanning, and one naming an unknown setting. Pass: no secret scanning write, entry `left-off` with `owner-choice` and the configured reason; the second run fails and names the field. |
| AC-17 | `bun test tests/vh-adlc/security-settings`, fixture: public repository with push protection on and a keep-off row for it. Pass: no write recorded for it, entry `already-on` with `owner-choice-conflict`, listed in the Markdown owner decisions. |
| AC-18 | Same suite, fixtures where an admin read of `automated-security-fixes` returns 500, and where `GET vulnerability-alerts` returns 404. Pass: the first gives that entry `unknown` with `api-error` and 500, no write to it, other settings processed, exit code 1; the second writes alerts and reports `enabled`. |
| AC-19 | Same suite, fixtures: archived private repository run by a non-admin; private repository with a keep-off row for secret scanning; `check` with alerts off, `dependabot.yml` and no Renovate. Pass: entries `unavailable` with `archived`; secret scanning `unavailable` with `not-free-on-private`; security updates `not-changed` with `check-only`. |
| AC-16 | `bun test tests/vh-adlc/maintenance` with a collector fixture for a private repository whose code scanning read returns 403, and one returning 404. Pass: the surface is `complete-unavailable` with `not-free-on-private` and the status. A public fixture with the same 403 stays incomplete. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-10 | R-1 | spec | `1a93d2f` | claude-opus-4.8 | procedural | 12 findings: 8 should-fix, 4 nits, none blocking |
| 2026-11-10 | R-2 | spec | `812a0aa` | claude-opus-4.8 | procedural | 7 findings: 5 should-fix, 2 nits, none blocking |

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

## Sources

- [About GitHub Advanced Security](https://docs.github.com/en/get-started/learning-about-github/about-github-advanced-security): the dependency graph and Dependabot alerts are in all plans; code scanning and secret scanning are on for public repositories by default and need GitHub Code Security or Secret Protection, on a Team or Enterprise plan, for private and internal repositories. Read 2026-11-10.
- [Dependabot alerts](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-alerts): repository administrators can enable alerts, and GitHub then generates the dependency graph and alerts. Read 2026-11-10.
- [Dependabot security updates](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-security-updates): available where the dependency graph and alerts are enabled; when on, Dependabot tries to open a pull request for every open alert with a patch. Read 2026-11-10.
- [Configuring default setup for code scanning](https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/configure-code-scanning/configuring-default-setup-for-code-scanning): switching to default setup disables an existing CodeQL workflow file and blocks CodeQL analysis uploads. Read 2026-11-10.
- [vhco-pro/docs#30, `conventions/repository-security.md` at 89d567a](https://github.com/vhco-pro/docs/blob/89d567a/conventions/repository-security.md): the proposed convention. Public repositories get the dependency graph, Dependabot alerts, secret scanning and push protection, plus CodeQL and Scorecard through reusable workflows in `vhco-pro/.github`. Private repositories get the dependency graph and Dependabot alerts, and reports list the rest as unavailable. Renovate repositories keep Dependabot security updates off; they are turned on only with a `.github/dependabot.yml` or `.github/dependabot.yaml` and no sign of Renovate (changed in `89d567a` for Q13). Open, not merged, read 2026-11-10.
- [Renovate configuration options](https://docs.renovatebot.com/configuration-options/): the documented config file locations, including a `renovate` section in `package.json`, and that `vulnerabilityAlerts` reads GitHub's alerts only when the dependency graph and Dependabot alerts are enabled. Read 2026-11-10.
