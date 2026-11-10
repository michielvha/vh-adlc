---
status: draft
status_description: "Being written; open questions Q1 to Q3 wait for the owner, then a spec review."
issue: null
goal: "Every maintenance sweep leaves a repository with each GitHub security setting its plan offers for free turned on, without duplicating Renovate's pull requests, and reports what it changed."
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

Maintenance sweeps turn on the GitHub security settings a repository's plan includes at no cost,
instead of only reporting that they are off. Dependabot security updates stay off where Renovate
already opens update pull requests.

## Context

### Owner summary

A maintenance sweep on `michielvha/bg-remove` found Dependabot alerts disabled. The sweep could only
record that as a coverage gap, and Renovate could not open its vulnerability-fix pull requests
because those depend on the alerts. The owner enabled the alerts by hand. Within minutes GitHub
listed 47 open alerts and Renovate opened two security pull requests.

This feature makes that step part of every sweep. A new helper reads the repository's visibility,
the caller's admin permission and each setting's current state. It then turns on what is off and
available. It always enables the dependency graph and Dependabot alerts, which every GitHub plan
includes, private repositories too. It enables Dependabot security updates only when the repository
has no Renovate, so the two bots never open competing pull requests. Q1 decides whether public
repositories also get secret scanning, push protection and CodeQL default setup. GitHub gives those
to public repositories for free; private repositories need a paid GitHub Advanced Security product.

The helper never turns a setting off. It does not try a paid feature on a private repository. It
does nothing when the caller lacks admin rights or the current request forbids live changes. Each
of those cases appears in the report with its reason. A second run on the same repository changes
nothing and reports every setting as already on.

The owner decided on 2026-11-10 that sweeps apply these settings, not only check them. That changes
the authority table: today only automatic merged-branch deletion is a repository setting vh-adlc
may change, and only after the owner says yes. Q2 settles how Renovate is detected. Q3 settles
whether onboarding applies the settings as well.

Proof is planned, not observed: Bun tests drive the helper against a fake `gh` for each repository
shape, and a manual read-only check runs against `michielvha/bg-remove`. No spec review has run yet.
Accepting this document authorizes tasks and implementation on a feature branch. It does not
authorize a release, a plugin version bump or a change to any repository other than through a
sweep that this feature defines.

### Background

The maintenance collector reads open Dependabot and code scanning alerts per repository
(`plugins/vh-adlc/scripts/maintenance/collect.ts:108-115`, `:240-241`). An unmatched 403 or 404
leaves that surface incomplete (`plugins/vh-adlc/references/maintenance.md:80`). Nothing in the
plugin changes a security setting; the only repository setting it writes is merged-branch deletion,
through `autoDelete` (`plugins/vh-adlc/scripts/branches/branches.ts:273-284`), and only with the
owner's yes (`plugins/vh-adlc/references/authority.md:32`, `plugins/vh-adlc/references/loop.md:70-73`,
`plugins/vh-adlc/references/lifecycle.md:64`, `plugins/vh-adlc/skills/vh-adlc-maintenance/SKILL.md:37-38`).
The user guide states that merged-branch deletion "is the only setting" vh-adlc checks
(`docs/user-guides/workflows.md:143-145`).

Observed on `michielvha/bg-remove` during maintenance run `7ece4509` on 2026-11-10:

- The Dependabot alerts endpoint returned 403 with alerts disabled, and code scanning returned 404
  with no analysis. Both surfaces were recorded as incomplete.
- `gh api -X PUT repos/michielvha/bg-remove/vulnerability-alerts` returned `HTTP/2.0 204 No Content`.
- `gh api repos/michielvha/bg-remove --jq .security_and_analysis` then showed
  `dependabot_security_updates` disabled and `secret_scanning` and `secret_scanning_push_protection`
  enabled on this public repository.
- `gh api 'repos/michielvha/bg-remove/dependabot/alerts?state=open'` listed 47 alerts about 20
  seconds later.
- `gh pr list -R michielvha/bg-remove --author app/renovate` showed PR #24 (`vite` to 8.1.6
  `[security]`) and PR #25 (`vitest` to 4.1.11 `[security]`), opened at 07:14 UTC after the alerts
  were enabled.
- The repository has no Renovate configuration file, yet Renovate opens its pull requests. A rule
  that looks only for a config file would miss it (Q2).

The configured bot authors default to `renovate` and `dependabot`
(`plugins/vh-adlc/scripts/maintenance/settings.ts:109`).

Plan availability, from GitHub's documentation (see Sources): the dependency graph and Dependabot
alerts are included in all plans. Dependabot security updates need only the dependency graph and
alerts. Code scanning and secret scanning are on for public repositories by default. Private and
internal repositories need GitHub Code Security or GitHub Secret Protection, which require a Team or
Enterprise plan. Renovate reads GitHub's vulnerability alerts only when the dependency graph and
Dependabot alerts are enabled. With security updates on, Dependabot tries to open a pull request
for every open alert that has a patch.

Owner decisions folded in on 2026-11-10:

- Sweeps apply the settings instead of only reporting them.
- Dependabot alerts are enabled in every repository whose plan offers them.
- Dependabot security updates are enabled only when Renovate is absent, because Renovate already
  opens the fix pull requests.
- Plan and visibility limits are respected; paid features are never attempted on private
  repositories without them.

## Scope

In scope:

- A helper that checks and applies repository security settings for one repository, given a
  checkout or `OWNER/NAME`.
- The dependency graph and Dependabot alerts, wherever the plan offers them.
- Dependabot security updates when Renovate is absent, by the rule Q2 selects.
- The public-repository settings Q1 selects.
- Running the helper in every maintenance sweep before collection, and at onboarding if Q3 selects
  it, with the outcome in the sweep report.
- The authority row, maintenance skill step, reference page and user-guide section for the above.

Out of scope:

- Turning any setting off, including Dependabot security updates on a repository that also has
  Renovate. The report flags that overlap instead.
- Dependabot version updates and any `dependabot.yml` file. Those need a commit, not a setting.
- Buying, enabling or reporting on paid GitHub Advanced Security for private repositories, and
  organization-level security configurations.
- Renovate configuration changes, including `vulnerabilityAlerts`.
- Changing how the collector classifies a 403 or 404 alert surface.

## Design

New helper `plugins/vh-adlc/scripts/security-settings/`, shaped like the branch helper's
`auto-delete` (`plugins/vh-adlc/scripts/branches/branches.ts:273-284`):

```text
bun <plugin>/scripts/security-settings/cli.ts check (--repo PATH | --repository OWNER/NAME)
bun <plugin>/scripts/security-settings/cli.ts apply (--repo PATH | --repository OWNER/NAME)
```

`check` reads only. `apply` reads, writes what is off and available, then reads again and reports
the settings it read back. Both print one JSON object with the repository, its visibility, the
caller's admin permission, the Renovate detection result with its evidence, and one entry per
setting. Each entry has a state from this list:

| State | Meaning |
| --- | --- |
| `already-on` | Read as on before any write |
| `enabled` | Off before, written, and read back as on |
| `left-off` | Deliberately not enabled, with reason `renovate-present` or `not-selected` |
| `unavailable` | The plan or visibility does not include it, with reason |
| `not-changed` | Off and available, but not written, with reason `needs-admin`, `restricted` or `api-error` and the HTTP status |

The exit code is 0 when no entry is `not-changed`, and 1 otherwise.

Reads and writes, through `gh api`:

- `repos/{r}`: `visibility`, `permissions.admin` and `security_and_analysis`.
- Dependency graph and Dependabot alerts: `GET` and `PUT repos/{r}/vulnerability-alerts`. GitHub
  turns the dependency graph on with the alerts.
- Dependabot security updates: `GET` and `PUT repos/{r}/automated-security-fixes`.
- Secret scanning and push protection (Q1): `PATCH repos/{r}` with `security_and_analysis`.
- CodeQL default setup (Q1): `GET` and `PATCH repos/{r}/code-scanning/default-setup` with
  `state: configured`.

Renovate detection follows Q2. Detection evidence, such as the matched file path or pull request
number, goes into the output. When detection cannot complete, the helper treats Renovate as present
and reports `left-off` with the detection error, so a failed lookup never creates duplicate pull
requests.

A setting that `security_and_analysis` omits, or whose write returns 403 or 422 on a private
repository, is `unavailable` with reason `plan`. A setting listed for public repositories only is
`unavailable` with reason `visibility` on a private or internal repository, and the helper does not
call its write endpoint.

Procedure changes:

- `references/security-settings.md` (new) documents the commands, states and authority.
- The maintenance skill gets a step before collection: run `apply` for each repository in scope,
  then collect, so newly enabled alerts are collected in the same run. When alerts were enabled in
  this run, the report says the alert list may still be filling.
- `references/maintenance.md` adds a "Repository security settings" report section listing each
  entry with its state and reason.
- `references/authority.md` gets a row: a maintenance sweep (and onboarding, if Q3 selects it)
  may enable these settings on a repository in its scope. A current request that forbids live or
  remote changes wins, and the helper then runs `check` and reports `restricted`. Nothing grants
  disabling a setting.
- `references/loop.md` and `references/lifecycle.md` change only if Q3 selects onboarding.
- `docs/user-guides/workflows.md` gets a section beside "Stale branches" describing the default and
  the manual command, and corrects the sentence that calls merged-branch deletion the only setting.

## Acceptance Criteria

- [ ] AC-01: After `apply` on a repository where the caller is admin and Dependabot alerts are off,
      the dependency graph and Dependabot alerts are on, and the output lists Dependabot alerts as
      `enabled`.
- [ ] AC-02: After `apply` on a repository where Renovate is present by the Q2 rule, Dependabot
      security updates are still off, and the output lists them as `left-off` with reason
      `renovate-present` and the detection evidence.
- [ ] AC-03: After `apply` on a repository where Renovate is absent by the Q2 rule and the caller is
      admin, Dependabot security updates are on and listed as `enabled`.
- [ ] AC-04: After `apply` on a public repository, every setting Q1 selects is on, and the
      settings it does not select are listed as `left-off` with reason `not-selected`.
- [ ] AC-05: After `apply` on a private repository without GitHub Advanced Security, the helper has
      made no write call for any public-only or paid setting, lists each as `unavailable` with its
      reason, and still enables the dependency graph and Dependabot alerts.
- [ ] AC-06: When the caller is not admin, or the request forbids live changes, `apply` makes no
      write call, lists every off setting as `not-changed` with reason `needs-admin` or
      `restricted`, and exits 1.
- [ ] AC-07: `apply` never makes a write call that turns a setting off, and a second `apply` on the
      same repository makes no write call and lists every setting as `already-on`, `left-off` or
      `unavailable`.
- [ ] AC-08: When Renovate detection fails, Dependabot security updates stay off and are listed as
      `left-off` with the detection error.
- [ ] AC-09: A maintenance sweep runs `apply` before collection for each repository in scope, and
      its saved report has a "Repository security settings" section listing every entry with its
      state and reason.
- [ ] AC-10: `references/authority.md`, the maintenance skill, `references/security-settings.md` and
      `docs/user-guides/workflows.md` describe the apply-by-default rule, the Renovate exception, the
      plan limits and the never-disable rule. If Q3 selects onboarding, `references/loop.md` and
      `references/lifecycle.md` describe onboarding applying the settings.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01, AC-03, AC-04 | `bun test tests/vh-adlc/security-settings` with a fake `gh` that records every call. Fixture: public repository, admin, everything off, no Renovate. Pass: the listed settings are written once, read back on, reported `enabled`. |
| AC-02 | Same suite, fixture with Renovate present by each Q2 signal. Pass: no write to `automated-security-fixes`, entry `left-off` with reason `renovate-present` and the matched evidence. |
| AC-05 | Same suite, fixture: private repository whose `security_and_analysis` omits the paid settings. Pass: writes recorded only for `vulnerability-alerts` (and `automated-security-fixes` when Renovate is absent); the others are `unavailable` with reason. |
| AC-06 | Same suite, fixtures for `permissions.admin: false` and for the restricted request flag. Pass: zero write calls, entries `not-changed` with the reason, exit code 1. |
| AC-08 | Same suite, fixture where every detection call fails. Pass: no write to `automated-security-fixes`, entry `left-off` naming the detection error. |
| AC-09 | Same suite: a maintenance test drives a sweep fixture through the skill's documented helper order and checks the report section. Manual: run a sweep on `michielvha/bg-remove` and read the saved report. Pass: the section lists Dependabot alerts `already-on` and security updates `left-off` with reason `renovate-present`. |
| AC-07 | Same suite: a second `apply` on the first fixture records no write calls and reports every entry `already-on`, `left-off` or `unavailable`; across every fixture, no recorded write turns a setting off. Manual: `check --repository michielvha/bg-remove`. Pass: exit 0, no write, alerts `already-on`. |
| AC-10 | Reviewer reads the four pages (six with Q3 onboarding) at the implementation commit and confirms each rule is stated. |

## Tasks

None yet; written once the document is planned.

## Open Questions

### Q1: Which settings beyond the dependency graph, alerts and security updates should a sweep turn on for public repositories?

**Recommendation:** A. They cost nothing on public repositories and none of them opens pull requests that compete with Renovate.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Secret scanning, push protection and CodeQL default setup** | Every free scanner on, and the code scanning surface stops being an unexplained 404 | CodeQL adds an Actions workflow run on pushes and pull requests, and its alerts become a new surface to triage |
| **B. Secret scanning and push protection only** | Leaked secrets are blocked, with no new workflow runs | Code scanning stays off; the sweep only reports it |
| **C. None** | Smallest change to each repository | Public repositories keep whatever GitHub's defaults left |

**Why this is yours:** CodeQL runs workflows and creates alerts in every public repository it is applied to, which is a cost and triage choice.

### Q2: How should the helper decide that Renovate is present?

**Recommendation:** A. bg-remove has no config file, so a file-only rule would turn on Dependabot security updates beside Renovate there.

| Option | You get | It costs |
| --- | --- | --- |
| **A. A Renovate config file on the default branch, or any pull request ever authored by `app/renovate`** | Catches app-level configuration like bg-remove's | A repository that dropped Renovate long ago never gets security updates until someone enables them by hand |
| **B. Config file, or a Renovate pull request in the last 90 days** | Recovers repositories that stopped using Renovate | A quiet repository with Renovate may look absent and get duplicate pull requests |
| **C. Config file only** | Simple and readable from the tree | Misses bg-remove and other app-level setups |

**Why this is yours:** It trades duplicate pull requests against missed security updates.

### Q3: Should onboarding apply the same settings, or only sweeps?

**Recommendation:** A. A new repository is the first point where alerts matter, and onboarding already checks merged-branch deletion.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Onboarding and sweeps** | Settings are on from the first vh-adlc run in a repository | Onboarding gains a live repository change in addition to its commit |
| **B. Sweeps only** | Onboarding stays commit-only apart from the merged-branch check | Settings stay off until the first maintenance sweep |

**Why this is yours:** It widens what onboarding may change without asking.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |

## Sources

- [About GitHub Advanced Security](https://docs.github.com/en/get-started/learning-about-github/about-github-advanced-security): the dependency graph and Dependabot alerts are in all plans; code scanning and secret scanning are on for public repositories by default and need GitHub Code Security or Secret Protection, on a Team or Enterprise plan, for private and internal repositories. Read 2026-11-10.
- [Dependabot alerts](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-alerts): repository administrators can enable alerts, and GitHub then generates the dependency graph and alerts. Read 2026-11-10.
- [Dependabot security updates](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-security-updates): available where the dependency graph and alerts are enabled; when on, Dependabot tries to open a pull request for every open alert with a patch. Read 2026-11-10.
- [Renovate configuration options, vulnerabilityAlerts](https://docs.renovatebot.com/configuration-options/#vulnerabilityalerts): Renovate reads GitHub's vulnerability alerts only when the dependency graph and Dependabot alerts are enabled. Read 2026-11-10.
