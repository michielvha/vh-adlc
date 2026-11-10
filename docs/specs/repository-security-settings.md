---
status: draft
status_description: "Owner answered Q1 to Q3 on 2026-11-10 and aligned the design with vhco-pro/docs#30; waiting for the first spec review."
issue: null
goal: "Every maintenance sweep and onboarding leaves a repository with each GitHub security setting its plan offers for free turned on, without duplicating Renovate's pull requests, and reports what it changed."
covers:
  - plugins/vh-adlc/scripts/security-settings/
  - plugins/vh-adlc/references/security-settings.md
  - plugins/vh-adlc/references/maintenance.md
  - plugins/vh-adlc/references/authority.md
  - plugins/vh-adlc/references/loop.md
  - plugins/vh-adlc/references/lifecycle.md
  - plugins/vh-adlc/skills/vh-adlc-maintenance/SKILL.md
  - docs/user-guides/workflows.md
  - tests/vh-adlc/security-settings/
---

# Plan: Repository security settings

Maintenance sweeps and onboarding turn on the GitHub security settings a repository's plan includes
at no cost, instead of only reporting that they are off. Dependabot security updates stay off where
Renovate already opens update pull requests.

## Context

### Owner summary

A maintenance sweep on `michielvha/bg-remove` found Dependabot alerts disabled. It could only record
that as a coverage gap, and Renovate could not open its vulnerability-fix pull requests because those
read the alerts. The owner enabled the alerts by hand. Within a minute GitHub listed 47 open alerts,
and Renovate opened two security pull requests soon after.

This feature makes that step automatic. A new helper reads the repository's visibility, the caller's
admin permission and each setting's state, then turns on what is off and free:

- Dependabot alerts, with the dependency graph, in every repository. Every GitHub plan includes them,
  private repositories too.
- Dependabot security updates only when Renovate is absent, so the two bots never open competing pull
  requests. Renovate counts as present when the default branch has a Renovate config file or
  `app/renovate` has ever opened a pull request in the repository.
- On public repositories, secret scanning and push protection.

Every maintenance sweep runs the helper before it collects alerts, and so does onboarding. The sweep
report gets a section listing each setting with its state and reason.

These rules match the repository security convention proposed in vhco-pro/docs#30, which the plugin
links to instead of restating. That convention runs CodeQL and Scorecard on public repositories
through reusable workflows added in a reviewed change, so the helper leaves code scanning alone.

The helper never turns a setting off. On private and internal repositories it does not try the
public-only settings, which need a paid product there. It writes nothing when the caller lacks admin
rights, when the repository is archived, or when the current request forbids live changes; the
report says which. A second run changes nothing. Merged-branch deletion keeps its existing ask-first
rule.

The owner decided all of this on 2026-11-10, answering Q1 to Q3 with the recommended option and then
asking for the design to follow vhco-pro/docs#30, which moves CodeQL to a workflow. It widens the
authority table, which today lets vh-adlc change one repository setting, and only after the owner
says yes.

Proof is planned, not observed: Bun tests drive the helper against a fake `gh` for each repository
shape, and a live sweep of `michielvha/bg-remove` checks the report section. No spec review has run
yet. Acceptance authorizes tasks, implementation on a feature branch and that live sweep. A release, a plugin version bump and changes to any other repository outside a sweep or
onboarding still need separate approval.

### Background

The maintenance collector reads open Dependabot and code scanning alerts per repository
(`plugins/vh-adlc/scripts/maintenance/collect.ts:108-115`, `:240-241`). An unmatched 403 or 404
leaves that surface incomplete (`plugins/vh-adlc/references/maintenance.md:80`). Nothing in the
plugin changes a security setting. The only repository setting it writes is merged-branch deletion,
through `autoDelete` (`plugins/vh-adlc/scripts/branches/branches.ts:273-284`), and only with the
owner's yes (`plugins/vh-adlc/references/authority.md:32`, `plugins/vh-adlc/references/loop.md:70-73`,
`plugins/vh-adlc/references/lifecycle.md:64`, `plugins/vh-adlc/skills/vh-adlc-maintenance/SKILL.md:37-38`).
The user guide says merged-branch deletion "is the only setting" vh-adlc checks
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
  8.1.6 `[security]`) and PR #25 (`vitest` to 4.1.11 `[security]`), opened at 07:14 UTC after the
  alerts were enabled.
- The repository has no Renovate config file, yet Renovate opens its pull requests, so a rule that
  looks only for a config file would miss it.

vhco-pro/docs#30 (open, head `5b73d9e`) proposes `conventions/repository-security.md`. Its feature
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

## Scope

In scope:

- A helper that checks and applies repository security settings for one repository, given a checkout
  or `OWNER/NAME`, with JSON and Markdown output.
- Dependabot alerts with the dependency graph, wherever the plan offers them.
- Dependabot security updates when Renovate is absent.
- Secret scanning and push protection on public repositories.
- Running the helper in every maintenance sweep before collection and during onboarding, with the
  outcome in the sweep report or the onboarding report.
- The authority row, maintenance skill step, onboarding text, reference page and user-guide section
  for the above.

Out of scope:

- Turning any setting off, including Dependabot security updates on a repository that also has
  Renovate. The report shows that overlap through the detection evidence instead.
- Dependabot version updates and any `dependabot.yml` file. Those need a commit, not a setting.
- Enabling, buying or using paid GitHub Advanced Security features on private or internal
  repositories, and organization-level security configurations.
- Renovate configuration, including its `vulnerabilityAlerts` option.
- Changing how the collector classifies a 403 or 404 alert surface.
- Changing the ask-first rule for merged-branch deletion.
- CodeQL and Scorecard. The convention adds them as reusable workflows in a reviewed change. The
  helper never turns on CodeQL default setup, which would compete with that workflow. The sweep's
  existing code scanning surface still shows when no analysis ran.
- Restating the convention's policy in plugin pages; they link to it.

## Design

New helper `plugins/vh-adlc/scripts/security-settings/`, shaped like the branch helper's `auto-delete`
(`plugins/vh-adlc/scripts/branches/branches.ts:273-284`):

```text
bun <plugin>/scripts/security-settings/cli.ts check (--repo PATH | --repository OWNER/NAME) [--format json|markdown]
bun <plugin>/scripts/security-settings/cli.ts apply (--repo PATH | --repository OWNER/NAME) [--format json|markdown]
```

`check` only reads. `apply` reads, writes each setting that is off and free, then reads that setting
again. The default JSON output holds the repository, its visibility, whether it is archived, the
caller's admin permission, the Renovate detection result with its evidence, and one entry for each of
four settings: `dependabot_alerts`, `dependabot_security_updates`, `secret_scanning` and
`secret_scanning_push_protection`. The `dependabot_alerts` entry
covers the dependency graph, which GitHub generates when alerts are enabled. `--format markdown` prints the same data as a
`## Repository security settings` section with one table row per entry.

Each entry has one state:

| State | Meaning |
| --- | --- |
| `already-on` | Read as on before any write |
| `enabled` | Off before, written, and read back as on |
| `left-off` | Deliberately not enabled; reason `renovate-present` or `renovate-detection-failed` |
| `unavailable` | Not free for this repository; reason `not-free-on-private` or `archived` |
| `not-changed` | Off and free, but not written or not read back as on; reason `check-only`, `needs-admin` or `api-error` with the HTTP status |

The exit code is 0 when no entry is `not-changed`, and 1 otherwise.

Reads and writes, all through `gh api`:

- `repos/{r}`: `visibility`, `archived`, `permissions.admin` and `security_and_analysis`.
- Dependabot alerts and the dependency graph: `GET` and `PUT repos/{r}/vulnerability-alerts`.
- Dependabot security updates: `GET` and `PUT repos/{r}/automated-security-fixes`.
- Secret scanning and push protection: `PATCH repos/{r}` with `security_and_analysis`.

Renovate detection reads the default branch for each config location Renovate documents
(`renovate.json`, `renovate.jsonc`, `renovate.json5` at the root and under `.github/` and `.gitlab/`,
`.renovaterc`, `.renovaterc.json`, `.renovaterc.jsonc`, `.renovaterc.json5`, and a `renovate` key in
the root `package.json`). It then looks for any pull request in any state authored by `app/renovate`.
Either match makes Renovate present, and the output names the matched path or pull request number.
When a lookup fails and nothing matched, `dependabot_security_updates` is `left-off` with reason
`renovate-detection-failed` and the error, so a failed lookup never creates duplicate pull requests.

Availability rules, applied before any write:

- On a private or internal repository, secret scanning and push protection are `unavailable` with reason `not-free-on-private`, unless the first read shows them on, which makes
  them `already-on`. The helper calls none of their write endpoints there.
- On an archived repository, every setting that is off is `unavailable` with reason `archived`, and
  the helper makes no write.
- When `permissions.admin` is false, every setting that is off and free is `not-changed` with reason
  `needs-admin`, and the helper makes no write.
- A write that fails, or a setting not read back as on, gives `not-changed` with reason `api-error`
  and the status. The helper still processes the remaining settings.

Procedure changes:

- `references/security-settings.md` (new) documents the commands, states, reasons, detection rule and
  authority. For which features a repository should have, it links to
  `conventions/repository-security.md` in vhco-pro/docs instead of restating it.
- The maintenance skill gets a step before collection: run `apply` for each repository in scope, or
  `check` when the current request forbids live or remote changes, then collect, so alerts enabled in
  this run are collected in the same run. When alerts were enabled in this run, the report says the
  alert list may still be filling.
- `references/maintenance.md` adds the `## Repository security settings` section to the sweep report,
  taken from the helper's Markdown output.
- `references/authority.md` gets a row: a maintenance sweep or onboarding may enable these settings
  on a repository in its scope with `apply`. A current request that forbids live or remote changes
  wins, and the procedure then runs `check`. Nothing grants turning a setting off.
- `references/loop.md:70-73` and `references/lifecycle.md:64` add that onboarding runs `apply` and
  reports its output beside the merged-branch deletion check. Like that check, it is a repository
  change, not a commit, and never holds up the onboarding commit.
- `docs/user-guides/workflows.md` gets a section beside "Stale branches" describing the default and
  the manual commands, and corrects the sentence that calls merged-branch deletion the only setting.

## Acceptance Criteria

- [ ] AC-01: After `apply` on a repository where the caller is admin and Dependabot alerts are off,
      `GET repos/{r}/vulnerability-alerts` returns 204 and the output lists `dependabot_alerts` as
      `enabled`.
- [ ] AC-02: After `apply` on a repository whose default branch has any documented Renovate config
      location, or where `app/renovate` has authored a pull request, Dependabot security updates are
      still off, and the output lists them as `left-off` with reason `renovate-present` and the
      matched path or pull request number.
- [ ] AC-03: After `apply` on a repository with no Renovate config and no `app/renovate` pull
      request, where the caller is admin, Dependabot security updates are on and listed as `enabled`.
- [ ] AC-04: After `apply` on a public repository where the caller is admin, secret scanning and push
      protection are each listed as `enabled` or `already-on`, and no call to any `code-scanning`
      endpoint was made.
- [ ] AC-05: After `apply` on a private or internal repository where those two settings are off,
      no write call was made for them, each is `unavailable` with reason `not-free-on-private`, and
      Dependabot alerts are still enabled. On an archived repository, `apply` makes no write call and
      every off setting is `unavailable` with reason `archived`.
- [ ] AC-06: When the caller is not admin, `apply` makes no write call, lists every off and free
      setting as `not-changed` with reason `needs-admin`, and exits 1. `check` never makes a write
      call; it lists every off and free setting as `not-changed` with reason `check-only`, and exits
      1 when there is at least one.
- [ ] AC-07: `apply` never makes a write call that turns a setting off. A second `apply` on the same
      repository makes no write call and lists every setting as `already-on`, `left-off` or
      `unavailable`.
- [ ] AC-08: When every Renovate detection lookup fails, Dependabot security updates stay off and are
      listed as `left-off` with reason `renovate-detection-failed` and the error.
- [ ] AC-09: When one write fails, that setting is `not-changed` with reason `api-error` and the HTTP
      status, the remaining settings are still processed, and `apply` exits 1.
- [ ] AC-10: `--format markdown` prints a `## Repository security settings` section with one row per
      setting giving its state and reason, matching the JSON output for the same run.
- [ ] AC-11: `references/security-settings.md`, `references/authority.md`, `references/maintenance.md`,
      `references/loop.md`, `references/lifecycle.md`, the maintenance skill and
      `docs/user-guides/workflows.md` state: sweeps run `apply` before collection, or `check` under a
      restricting request; onboarding runs `apply`; the Renovate rule; the private and archived
      limits; and that no setting is ever turned off. `references/security-settings.md` links to
      `conventions/repository-security.md` for which features each visibility gets.
- [ ] AC-12: After a maintenance sweep of `michielvha/bg-remove`, its saved report has a
      `## Repository security settings` section that lists Dependabot alerts `already-on`,
      Dependabot security updates `left-off` with reason `renovate-present`, and secret scanning and
      push protection `already-on`.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01, AC-03, AC-04 | `bun test tests/vh-adlc/security-settings` with a fake `gh` that records every call and keeps settings state. Fixture: public repository, admin, every setting off, no Renovate. Pass: each of the four settings written once, read back on and reported `enabled`, and no `code-scanning` call recorded. |
| AC-02 | Same suite, one fixture per documented config location, one with a `renovate` key in `package.json`, and one with only an `app/renovate` pull request. Pass: no write to `automated-security-fixes`, entry `left-off` with `renovate-present` and the matched path or pull request number. |
| AC-05 | Same suite, fixtures: private repository, internal repository and archived public repository, each with every setting off. Pass: the private and internal runs record writes only to `vulnerability-alerts` and `automated-security-fixes`, with the two public-only entries `unavailable` and `not-free-on-private`; the archived run records no writes and every entry is `unavailable` with `archived`. |
| AC-06 | Same suite, fixture with `permissions.admin: false` run with `apply`, and the first fixture run with `check`. Pass: zero write calls in both, entries `not-changed` with `needs-admin` or `check-only`, exit code 1. |
| AC-07 | Same suite: a second `apply` on the first fixture's resulting state records no writes and reports only `already-on`, `left-off` or `unavailable`. Across every fixture, no recorded write has a body or endpoint that disables a setting. |
| AC-08 | Same suite, fixture where every detection call fails. Pass: no write to `automated-security-fixes`, entry `left-off` with `renovate-detection-failed` and the error. |
| AC-09 | Same suite, fixture where the `PATCH repos/{r}` write returns 422. Pass: secret scanning entries `not-changed` with `api-error` and 422, other settings still `enabled`, exit code 1. |
| AC-10 | Same suite: run the first fixture with both formats. Pass: the Markdown section has one row per JSON entry with the same state and reason. |
| AC-11 | The reviewer reads the seven files at the implementation commit and confirms each listed rule is stated, and that the merged-branch deletion rule is unchanged. |
| AC-12 | Manual: run a maintenance sweep of `michielvha/bg-remove` with the implemented plugin and read the saved report. Pass: the section shows the three listed states. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |

## Sources

- [About GitHub Advanced Security](https://docs.github.com/en/get-started/learning-about-github/about-github-advanced-security): the dependency graph and Dependabot alerts are in all plans; code scanning and secret scanning are on for public repositories by default and need GitHub Code Security or Secret Protection, on a Team or Enterprise plan, for private and internal repositories. Read 2026-11-10.
- [Dependabot alerts](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-alerts): repository administrators can enable alerts, and GitHub then generates the dependency graph and alerts. Read 2026-11-10.
- [Dependabot security updates](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-security-updates): available where the dependency graph and alerts are enabled; when on, Dependabot tries to open a pull request for every open alert with a patch. Read 2026-11-10.
- [Configuring default setup for code scanning](https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/configure-code-scanning/configuring-default-setup-for-code-scanning): switching to default setup disables an existing CodeQL workflow file and blocks CodeQL analysis uploads. Read 2026-11-10.
- [vhco-pro/docs#30, `conventions/repository-security.md` at 5b73d9e](https://github.com/vhco-pro/docs/blob/5b73d9e/conventions/repository-security.md): the proposed convention. Public repositories get the dependency graph, Dependabot alerts, secret scanning and push protection, plus CodeQL and Scorecard through reusable workflows in `vhco-pro/.github`. Private repositories get the dependency graph and Dependabot alerts, and reports list the rest as unavailable. Renovate repositories keep Dependabot security updates off, and repositories without Renovate turn them on. Open, not merged, read 2026-11-10.
- [Renovate configuration options](https://docs.renovatebot.com/configuration-options/): the documented config file locations, including a `renovate` section in `package.json`, and that `vulnerabilityAlerts` reads GitHub's alerts only when the dependency graph and Dependabot alerts are enabled. Read 2026-11-10.
