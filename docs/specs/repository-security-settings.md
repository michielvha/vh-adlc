---
status: draft
status_description: "R-9 findings folded with the recommended options per the owner's standing instruction; a new spec review is due. Implementation waits for vhco-pro/docs#30 to merge."
issue: null
goal: "Every maintenance sweep and onboarding by a consumer that opts in turns on, in each repository of its scope, Dependabot alerts wherever the plan offers them, secret scanning and push protection on public repositories, and Dependabot security updates where Dependabot is the updater, without duplicating Renovate's pull requests; every sweep reports each setting's state and what it changed."
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

A sweep on `michielvha/bg-remove` found Dependabot alerts off: a coverage gap, and no Renovate
security fixes, since Renovate reads the alerts. Once the owner enabled them, GitHub
listed 47 alerts and Renovate opened two security pull requests.

A new helper automates that step. Sweeps run it before collecting alerts, and so does onboarding.
When the sweeping repository's committed `.vh-adlc/maintenance.yaml` opts in with
`security_settings: apply`, it turns these on when off in every repository the sweep covers, except
what the keep-off list names; elsewhere, or under a restricting request, it only checks:

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

The rules follow vhco-pro/docs#30. CodeQL and Scorecard come from its reusable
workflows, so the helper never turns on CodeQL default setup. Implementation waits for docs#30 to merge, then moves both docs pins
with a plugin minor version bump.

These owner decisions widen the authority table. Today the only repository setting vh-adlc
changes is merged-branch deletion, with authorization.

Proof is planned, not observed: Bun tests against a fake `gh`, and a live sweep of bg-remove.
Reviews R-1 to R-9 found nothing blocking, and the owner answered their questions. Acceptance
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
bun <plugin>/scripts/security-settings/cli.ts check --repo PATH [--repository OWNER/NAME] [--run-id ID] [--format json|markdown]
bun <plugin>/scripts/security-settings/cli.ts apply --repo PATH [--repository OWNER/NAME] [--run-id ID] [--format json|markdown]
```

`--repo` is the checkout whose `.vh-adlc/maintenance.yaml` applies. `--repository` selects the target
and defaults to that checkout's validated origin. `check` only reads. `apply` reads, writes each
setting that is off and free, then reads that setting again.

`--run-id` is the maintenance run the helper serves, written into the JSON; onboarding has no run
and omits it. The default JSON output holds the repository, its visibility, whether it is archived, the caller's
admin permission, the Renovate and Dependabot detection results with their evidence, and one entry
for each of `dependabot_alerts`, `dependabot_security_updates`, `secret_scanning` and
`secret_scanning_push_protection`. The `dependabot_alerts` entry covers the dependency graph, which
GitHub generates when alerts are enabled. On private and internal repositories the output also has a
read-only `code_scanning` entry. `--format markdown` prints the same data as a
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

All through `gh api`:

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
   protection are `unavailable` unless the admin read shows them on, which makes them `already-on`.
   The helper calls none of their write endpoints there. The `code_scanning` entry is `unavailable`
   only when the caller is admin and `security_and_analysis` shows neither `advanced_security` nor
   `code_security` with status `enabled`, a null block included. When either is enabled, the output
   has no `code_scanning` entry, as on a public repository.
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

Rules 1 to 4 need no reading of the setting, or report that the read failed, so no entry claims a
state the helper could not see.

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

Renovate has no signal only when every Renovate lookup succeeded and none matched. Any failed
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
fails with 403 or 404. In every other case a failed read stays incomplete, as today. A successful
read still wins.

The `collect` command gains `--security-settings FILE`, repeatable, taking the helper's JSON. When
a file lists `dependabot_alerts` as `enabled` for a repository, the collector records that
repository's Dependabot surface as incomplete with reason `alerts-enabled-this-run`, a null count,
as every incomplete surface has (`plugins/vh-adlc/scripts/maintenance/security-io.ts:43`), and the
alerts it read, since GitHub fills the list after the write. The next sweep, where alerts are
`already-on`, records it as usual.

With `--security-settings`, `collect` also takes `--run-id`. `collect` and `report` accept a file
only when it parses against the helper's JSON schema, carries the current run ID, names one
repository in the sweep's scope, and is the only file for that repository. Any other file, and
every file for a repository named more than once, is ignored for collection and shown in the
report as "helper did not run" with the reason. A bad file never fails either command.

`references/maintenance-settings.md:46-48` and `references/maintenance.md:78-80` today say that only
a configured exact match is `complete-unavailable` and that a bare 403 or 404 is unknown. Both
change to name the `not-free-on-private` rule beside that match, and `references/maintenance.md`
also names `alerts-enabled-this-run`.

### Settings

`references/maintenance-settings.md` and `scripts/maintenance/settings.ts` gain
`security_settings_keep_off`: rows of `{repository, settings, reason}`, where `repository` is in
declared scope, `settings` lists names from the four writable entries, and `reason` is required
text. Unknown setting names and duplicate repositories fail visibly, as for the other fields.

They also gain `security_settings`, `apply` or `check`, default `check`. Like the other standing
grants, it is read only from the consumer's committed default branch
(`plugins/vh-adlc/references/maintenance-settings.md:51-57`). `resolveStanding` checks committed
settings against a fixed key list (`plugins/vh-adlc/scripts/maintenance/authority.ts:100`) and
returns `invalid` for any other key, so that list gains `security_settings` and
`security_settings_keep_off`; otherwise committing either would void the consumer's standing
publication grant.

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
  `security-settings-mode` command that takes an optional `--run-id` and prints the mode with its
  reason. With a run, the mode is `check` when the recorded request lacks `authorized_sweep` true,
  has `read_only`, `draft_only`, `no_push` or `no_filesystem`
  (`plugins/vh-adlc/scripts/maintenance/authority.ts:13`), or when the run's scope has a pull
  request, and also when the committed settings do not adopt `security_settings: apply`. Otherwise
  it is `apply`. So only a full authorized sweep writes; a PR-scoped assessment checks. The helper
  runs once, before a new run's collection; a continuation reuses that run's saved files and does
  not run it again. `no_commit` alone does not select
  `check`, because a settings change is not a commit. Onboarding has no recorded maintenance
  request, so it runs the command without one and the committed settings alone decide, except
  that an onboarding request that is read-only or draft-only, or forbids pushing or filesystem
  writes, selects `check` without calling the command, as in a sweep.
- For an `alerts-enabled-this-run` surface, the maintenance skill records a coverage handoff naming
  the next sweep in the security analysis, as `security-reconcile` requires for any incomplete
  surface (`plugins/vh-adlc/scripts/maintenance/security.ts:143`,
  `plugins/vh-adlc/references/maintenance.md:327`).
- The maintenance skill gets a step before collection: for each repository in scope, run the helper
  in that mode with the run ID, save its JSON, then collect with those files. A helper failure or exit 1 never
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
  `references/maintenance.md` documents the section.
- `references/authority.md` gets a row: a maintenance sweep or onboarding may enable these settings
  with `apply` on a repository in its scope only when the consumer's committed settings adopt
  `security_settings: apply`. A request with a flag that selects `check` wins. Nothing grants turning a setting off. That adoption is the owner's
  agreement that `guides/onboard-a-repository.md` in vhco-pro/docs asks for before turning these
  settings on, and `references/security-settings.md` says so.
- `references/loop.md:70-73` and `references/lifecycle.md:64` add that onboarding runs the helper in
  the same mode and reports its output beside the merged-branch deletion check. Like that check, it is a repository
  change, not a commit, and never holds up the onboarding commit.
- `docs/user-guides/workflows.md` gets a section beside "Stale branches" describing the default and
  the manual commands. The merged-branch deletion text stays as it is.

## Acceptance Criteria

Each criterion covers the entries no earlier rule under "Rules applied before any write" decides,
with every read and write succeeding, unless it names another case.

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
      maintenance skill and `docs/user-guides/workflows.md` state: sweeps and onboarding run the
      helper before collection in the mode `security-settings-mode` prints; the `security_settings`
      opt-in and the flags that select `check`, in sweeps and, in `references/loop.md` and
      `references/lifecycle.md`, in onboarding; the Renovate and Dependabot rules; the private,
      archived and keep-off rules; that `renovate-overlap`, `owner-choice-conflict` and `paused` go to the
      owner; the precedence order; the `not-free-on-private` and `alerts-enabled-this-run`
      collector rules, in `references/maintenance.md` and `references/maintenance-settings.md`
      without the old "only a configured exact match" wording; that a helper failure never blocks
      collection, stated in the maintenance skill's step; that the security-settings helper's
      `apply` is an exception to "Report helpers never ... mutate GitHub", with the recorded run as
      intent and the JSON saved in the run's private journal directory as receipt; that no setting is
      ever turned off; and, in the authority row and `references/security-settings.md`, that adopting
      `security_settings: apply` is the agreement the onboarding guide asks for.
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
      Markdown owner decisions list.
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
      it; the maintenance skill records one naming the next sweep. With alerts
      `already-on`, a successful read stays complete.
- [ ] AC-22: A sweep report saved with `--security-settings` files has a
      `## Repository security settings` section after `## Security alerts` that names every
      repository in scope: one table per repository with a file, whose rows match its JSON entries,
      a "helper did not run" row for each repository without one, and an "Owner decisions" list
      holding exactly the entries with `renovate-overlap`, `owner-choice-conflict` or `paused` across all files.
- [ ] AC-23: When the helper's `repos/{r}` read fails, every writable entry is `unknown` with reason
      `api-error` and the status, no other read or write is made, and the helper exits 1. The
      collector covers every repository in scope when given helper files for only some of them.
      A helper file that is malformed, names a repository outside the scope, repeats a repository
      or carries another run ID changes no surface, fails neither `collect` nor `report`, and shows
      as "helper did not run" with the reason.
- [ ] AC-24: `security-settings-mode` prints `check` when the recorded request has `read_only`,
      `draft_only`, `no_push` or `no_filesystem`, or when the committed settings do not adopt
      `security_settings: apply`, or when the recorded request lacks `authorized_sweep` true, or
      when the run's scope has a pull request; otherwise it prints `apply`, also with no recorded
      request. A
      request with only `no_commit` gets `apply` when the settings adopt it. A `security_settings`
      value other than `apply` or `check` fails visibly. A value of `apply` present only in the
      working tree, only on an unmerged branch, or in a settings file `AGENTS.md` does not link gives
      `check`. The maintenance skill states that a current request forbidding filesystem writes
      selects `check` without calling `security-settings-mode`, with the helper's output kept in
      chat and no JSON saved.
- [ ] AC-25: A consumer whose committed settings hold `security_settings` and
      `security_settings_keep_off` keeps an adopted standing report-publication grant.
- [ ] AC-26: Under `apply`, security updates read as `{"enabled":true,"paused":true}` are
      `already-on` with reason `paused`, with or without a Renovate signal, unless the keep-off list
      names them, which gives `owner-choice-conflict`. No write is made, the helper exits 0 when no
      other entry fails, and the Markdown owner decisions list names the entry.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01, AC-03, AC-04 | `bun test tests/vh-adlc/security-settings` with a fake `gh` that records every call, keeps settings state, and denies admin-only reads and rejects a security-updates write while alerts are off, as GitHub does. Fixture: public repository, admin, every setting off, `.github/dependabot.yml`, no Renovate. Pass: the four settings written once, read back on and reported `enabled`, and no `code-scanning` call recorded. A second fixture with no `dependabot.yml` passes when security updates are `left-off` with `renovate-unknown` and no `automated-security-fixes` write was recorded. |
| AC-02 | Same suite, one fixture per documented config location, one with a `renovate` key in `package.json`, one with only an `app/renovate` pull request, and one with only an open Dependency Dashboard issue. Pass: no write to `automated-security-fixes`, entry `left-off` with `renovate-present` and the matched evidence. |
| AC-05 | Same suite, fixtures: private repository, internal repository and archived public repository, each with every setting off. `security_and_analysis` is null in the private and internal fixtures, and a third private fixture shows `code_security` enabled. Pass: the private and internal runs record writes only to `vulnerability-alerts` and `automated-security-fixes`, `dependabot_alerts` is read back and `enabled`, and secret scanning, push protection and `code_scanning` are `unavailable` with `not-free-on-private`; the third has no `code_scanning` entry; the archived run records no writes and every entry is `unavailable` with `archived`. |
| AC-06 | Same suite, unarchived public fixture with `permissions.admin: false` run with `apply`, and the first fixture run with `check`. Pass: zero write calls in both and no admin-only read in the first; entries `unknown` with `needs-admin`, or `not-changed` with `check-only`; exit code 1. |
| AC-07 | Same suite: a second `apply` on the first fixture's resulting state, after a first run that exited 0, records no writes and reports only `already-on`, `left-off` or `unavailable`. A further fixture whose first run has a failed Renovate lookup: that run exits 1. Across every fixture, no recorded write has a body or endpoint that disables a setting. |
| AC-08 | Same suite, public admin fixtures with security updates off and `.github/dependabot.yml`: every Renovate lookup fails; only the `renovate.json` lookup fails and the others match nothing; every Renovate lookup succeeds without a match and the `.github/dependabot.yml` lookup fails. Pass: no write to `automated-security-fixes` in any; the first two give `left-off` with `renovate-detection-failed` and the error, the third `left-off` with `dependabot-detection-failed` and the error; exit code 1 in all three. |
| AC-09 | Same suite, fixture where the `PATCH repos/{r}` write returns 422. Pass: secret scanning entries `not-changed` with `api-error` and 422, other settings still `enabled`, exit code 1. A second fixture where `PUT automated-security-fixes` returns 204 but the read-back gives `{"enabled":false,"paused":false}`. Pass: security updates `not-changed` with `api-error`, 204 and "not on after write", exit code 1. |
| AC-10 | Same suite: run the first fixture and the AC-14 fixture with both formats. Pass: the Markdown section has one row per JSON entry with the same state and reason, and its owner decisions list holds exactly the JSON entries with `renovate-overlap`, `owner-choice-conflict` or `paused`, or "None." |
| AC-11, AC-20 | The reviewer reads the eight files, `docs/reference/compatibility.md`, `AGENTS.md`, `plugins/vh-adlc/knowledge.md` and both `plugin.json` files at the implementation commit, confirms each listed rule is stated, the maintenance skill's and onboarding's `knowledge` page lists omit `conventions/repository-security.md`, the merged-branch deletion rule is unchanged, both pins name the docs#30 merge revision and both versions match a minor bump, then runs `vh-adlc knowledge --page conventions/repository-security.md` with the new plugin pin. Pass: the page resolves. |
| AC-12 | Manual: run a maintenance sweep of `michielvha/bg-remove` with the implemented plugin and read the saved report. Pass: the section shows the listed states. Limit: every setting there is already on or left off, so no live run shows a sweep enabling alerts and collecting them in the same run; the AC-21 fixture covers that path. |
| AC-13 | Same suite, fixture where the alerts write returns 403. Pass: no `automated-security-fixes` write recorded, entry `not-changed` with `alerts-off`, exit code 1. |
| AC-14 | Same suite, fixture with a Renovate config file and security updates already on. Pass: no write recorded, entry `already-on` with `renovate-overlap`, and the Markdown output lists it under owner decisions. |
| AC-15 | Same suite, public admin fixture with secret scanning off and a `.vh-adlc/maintenance.yaml` keep-off row for it, and one naming an unknown setting. Pass: no secret scanning write, entry `left-off` with `owner-choice` and the configured reason; the second run fails and names the field. |
| AC-17 | `bun test tests/vh-adlc/security-settings`, fixture: public repository with push protection on and a keep-off row for it. Pass: no write recorded for it, entry `already-on` with `owner-choice-conflict`, listed in the Markdown owner decisions. |
| AC-18 | Same suite, public admin fixtures with `.github/dependabot.yml` and no Renovate: `GET automated-security-fixes` returns 500, once without and once with a keep-off row for it; `GET vulnerability-alerts` returns 404; `GET automated-security-fixes` returns 200 with `{"enabled":false,"paused":false}`. Pass: the 500 runs give that entry `unknown` with `api-error` and 500, no write to it, other settings processed, exit code 1; the 404 run writes alerts and reports `enabled`; the 200 run writes security updates and reports `enabled`. |
| AC-19 | Same suite, fixtures: archived private repository run by a non-admin; private admin repository with a keep-off row for secret scanning; private non-admin repository; `check` on a public admin repository with alerts off, `dependabot.yml` and no Renovate. Pass: every entry `unavailable` with `archived` and no admin-only read, exit code 0; secret scanning `unavailable` with `not-free-on-private`; secret scanning and push protection `unavailable` with `not-free-on-private`, alerts, security updates and `code_scanning` `unknown` with `needs-admin`; security updates `not-changed` with `check-only`. A further `apply` fixture: public admin repository with `dependabot.yml`, no Renovate, alerts and security updates off, and a keep-off row for `dependabot_alerts`. Pass: both `left-off` with `owner-choice`, no write recorded, exit code 0. Another `apply` fixture: public admin repository, secret scanning and push protection off, a keep-off row for `secret_scanning` only. Pass: both `left-off` with `owner-choice`, no `PATCH repos/{r}` recorded. |
| AC-22 | `bun test tests/vh-adlc/maintenance`: render a report for four repositories in scope with three `--security-settings` files, holding a `renovate-overlap`, a `paused` and an `owner-choice-conflict` entry in different repositories. Pass: the section follows `## Security alerts`, each table's rows match its file's entries, the fourth repository has a "helper did not run" row, and the owner decisions list holds exactly those three entries. |
| AC-23 | `bun test tests/vh-adlc/security-settings`, fixture where `repos/{r}` returns 500, and `bun test tests/vh-adlc/maintenance` with a two-repository collector fixture given a helper file for the second repository only. Pass: four `unknown` entries with `api-error` and 500, no other recorded call, exit code 1; the collection covers both repositories. Further `collect` and `report` fixtures each add one bad file listing `dependabot_alerts` as `enabled`: malformed JSON, an out-of-scope repository, a second file for the same repository, and another run ID. Pass: both commands exit 0, no surface gets `alerts-enabled-this-run` from the bad file, and the report shows "helper did not run" with the reason. |
| AC-24 | `bun test tests/vh-adlc/maintenance`: `security-settings-mode` with settings adopting `apply` and a request with each of `read_only`, `draft_only`, `no_push`, `no_filesystem` and `no_commit`; with settings adopting `apply` and no request; with settings that do not adopt it and no request; and with `security_settings: maybe`. Pass: `check` for the first four, `apply` for `no_commit`, `apply` then `check` for the next two, and a visible failure naming the field for the last. Further fixtures with settings adopting `apply`: a request `{ "authorized_sweep": false }`, and an authorized run scoped to one pull request; each gives `check`. Further fixtures where `apply` is only in the working tree, only on an unmerged branch, or in a settings file `AGENTS.md` does not link: each gives `check`. The reviewer also reads the maintenance skill step at the implementation commit and confirms the `no_filesystem` rule is stated. |
| AC-26 | `bun test tests/vh-adlc/security-settings`, public admin fixtures with alerts on and `automated-security-fixes` returning `{"enabled":true,"paused":true}`: one with `dependabot.yml` and no Renovate, one with `renovate.json`, one with a keep-off row for security updates. Pass: `paused`, `paused`, then `owner-choice-conflict`, all `already-on`; no `PUT automated-security-fixes` recorded; exit code 0; each appears in the Markdown owner decisions list. |
| AC-25 | `bun test tests/vh-adlc/maintenance`: `resolveStanding` on committed settings with an adopted publication grant plus `security_settings: apply` and one `security_settings_keep_off` row. Pass: the grant resolves as adopted, not `invalid`. |
| AC-16 | `bun test tests/vh-adlc/maintenance` with collector fixtures for a private admin repository with `security_and_analysis` null whose code scanning read returns 403, and one returning 404. Pass: the surface is `complete-unavailable` with `not-free-on-private` and the status. Fixtures with the same 403 on a public repository, on a private repository read without admin, and on a private repository with `code_security` enabled stay incomplete. |
| AC-21 | `bun test tests/vh-adlc/maintenance` with one fake `gh` state shared by the helper and the collector: public admin repository, alerts off, three open Dependabot alerts that the alerts endpoint returns only once alerts are on; a second fixture whose endpoint returns an empty list on the first read after the write; a third with alerts already on. Run `apply`, then the collector with the helper's JSON. Pass: the first keeps three alerts and the second none, both with the surface incomplete, `alerts-enabled-this-run` and a null count, and `security-reconcile` accepts both inventories, reporting `coverage handoff pending` for the surface without a handoff and no such gap with one naming the next sweep; the third is complete. |

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

## Sources

- [About GitHub Advanced Security](https://docs.github.com/en/get-started/learning-about-github/about-github-advanced-security): the dependency graph and Dependabot alerts are in all plans; code scanning and secret scanning are on for public repositories by default and need GitHub Code Security or Secret Protection, on a Team or Enterprise plan, for private and internal repositories. Read 2026-11-10.
- [Dependabot alerts](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-alerts): repository administrators can enable alerts, and GitHub then generates the dependency graph and alerts. Read 2026-11-10.
- [Dependabot security updates](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-security-updates): available where the dependency graph and alerts are enabled; when on, Dependabot tries to open a pull request for every open alert with a patch. Read 2026-11-10.
- [Configuring default setup for code scanning](https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/configure-code-scanning/configuring-default-setup-for-code-scanning): switching to default setup disables an existing CodeQL workflow file and blocks CodeQL analysis uploads. Read 2026-11-10.
- [vhco-pro/docs#30, `conventions/repository-security.md` at 4b2198d](https://github.com/vhco-pro/docs/blob/4b2198d/conventions/repository-security.md): the proposed convention, written for the `michielvha` and `vhco-pro` accounts. Public repositories get the dependency graph, Dependabot alerts, secret scanning and push protection, plus CodeQL and Scorecard through reusable workflows in `vhco-pro/.github`. Private repositories get the dependency graph and Dependabot alerts, and reports list the rest as unavailable. Renovate repositories keep Dependabot security updates off; they are turned on only with a `.github/dependabot.yml` or `.github/dependabot.yaml` and no sign of Renovate (changed in `89d567a` for Q13). Open, not merged, read 2026-11-10.
- [vhco-pro/docs#30, `guides/onboard-a-repository.md` at 4b2198d](https://github.com/vhco-pro/docs/blob/4b2198d/guides/onboard-a-repository.md): the onboarding commands; `GET vulnerability-alerts` returns 204 when alerts are on and 404 when off; "With the owner's agreement, turn on Dependabot alerts in every repository"; security updates only with `.github/dependabot.yml` or `.github/dependabot.yaml` and no sign of Renovate (since `106ecfb`). Open, not merged, read 2026-11-10.
- [GitHub REST API description, `api.github.com.json`](https://github.com/github/rest-api-description/blob/main/descriptions/api.github.com/api.github.com.json): `GET /repos/{owner}/{repo}/vulnerability-alerts` answers 204 when alerts are enabled and 404 when not; `GET /repos/{owner}/{repo}/automated-security-fixes` answers 200 with `enabled` and `paused` booleans, or 404 when Dependabot is not enabled; the `security-and-analysis` schema includes `advanced_security` and `code_security`. Read 2026-11-10.
- [Renovate configuration options](https://docs.renovatebot.com/configuration-options/): the documented config file locations, including a `renovate` section in `package.json`, and that `vulnerabilityAlerts` reads GitHub's alerts only when the dependency graph and Dependabot alerts are enabled. Read 2026-11-10.
