# Repository security settings

GitHub offers free security settings that a repository has to switch on itself. Which of them a
repository should have, by its visibility, is decided by
[Repository security](https://github.com/vhco-pro/docs/blob/d8f07c9dd69038375a535af8ad586086688f85ab/conventions/repository-security.md)
at the plugin's docs pin; this page does not restate it. It covers how vh-adlc checks those settings
and, when the consumer has opted in, turns them on. Maintenance sweeps and onboarding both use it.
The plugin root is two directories above a skill's own directory.

## Commands

```text
bun <plugin>/scripts/maintenance/cli.ts security-settings-mode --repo <checkout> --repository OWNER/NAME --default-branch BRANCH --default-commit SHA [--run-id ID]
bun <plugin>/scripts/security-settings/cli.ts check --repo <checkout> [--default-branch BRANCH --default-commit SHA] [--repository OWNER/NAME] [--run-id ID] [--mode-reason TEXT] [--format json|markdown]
bun <plugin>/scripts/security-settings/cli.ts apply --repo <checkout> --default-branch BRANCH --default-commit SHA [--repository OWNER/NAME] [--run-id ID] [--format json|markdown]
```

`security-settings-mode` prints the mode for one repository, `check` or `apply`, with its reason.
`--repo` is the checkout whose `.vh-adlc/maintenance.yaml` applies. `--repository` picks the
target and defaults to that checkout's validated origin. `check` only reads. `apply` reads, writes
each setting that is off and free, then reads that setting again. `--run-id` names the maintenance
run the helper serves and goes into its JSON; onboarding has no run and leaves it out. Pass the
default-branch binding to `check` as well, so it reads the committed keep-off rows. `check` takes
the reason `security-settings-mode` printed, or the one the skill chose, as `--mode-reason`.

The JSON names the repository, its visibility, whether it is archived, the caller's admin
permission, the Renovate and Dependabot detection results with their evidence, the mode and mode
reason, and one entry for each of `dependabot_alerts`, `dependabot_security_updates`,
`secret_scanning` and `secret_scanning_push_protection`. The alerts entry covers the dependency
graph, which GitHub generates once alerts are on. A private or internal repository on github.com
also gets a read-only `code_scanning` entry. `--format markdown` prints the same data as a
`## Repository security settings` section, one table row per entry, followed by "Owner decisions".

The helper exits 0 when no entry is `not-changed` or `unknown` and none failed Renovate or
Dependabot detection, and 1 otherwise. Under `check`, every setting that is off reads
`not-changed`, so exit 1 there is normal.

## Who may apply

The consumer opts in by committing `security_settings: apply` in the `.vh-adlc/maintenance.yaml`
that `AGENTS.md` links on the default branch. Adopting it is the owner's agreement that
`guides/onboard-a-repository.md` in vhco-pro/docs asks for before these settings are turned on.
Without it, the default is `check`. `apply` reads the opt-in, the keep-off rows and the
repositories it may write to from those committed settings only, never from the working tree or an
unmerged branch. The origin repository always counts as named; any other repository needs a row in
the committed `repositories`.

`security-settings-mode` prints `check` with the first of these reasons that applies, and `apply`
with reason `adopted` when none does:

1. `request-restricted`, naming the flag: the run's recorded request has `read_only`,
   `draft_only`, `no_push` or `no_filesystem`. `no_commit` alone does not count, since a settings
   change is not a commit.
2. `not-authorized-sweep`: the recorded request lacks `authorized_sweep` true.
3. `pull-request-scope`: the run's scope has a pull request.
4. `not-in-run-scope`: the repository is outside the run's recorded `scope.repositories`.
5. `not-github-com`: the maintenance settings' `hostname` is not github.com. `apply` and the
   `not-free-on-private` rule hold only on github.com.
6. `not-adopted`: the committed settings do not adopt `security_settings: apply`.
7. `not-in-committed-scope`: the committed settings do not name the repository.

So among maintenance runs, only a full sweep whose request has `authorized_sweep` true may apply,
and a pull-request-scoped run checks. Onboarding has no recorded request, so it applies only as the
committed settings decide. The helper runs once, before a new run's collection; a continuation
reuses that run's saved helper files and does not run it again.

A sweep request that forbids filesystem writes creates no recorded run, so it selects `check` with
`request-restricted` without calling the command; the helper's output stays in chat and no JSON is
saved. An onboarding request that is read-only or draft-only, or forbids pushing or filesystem
writes, likewise selects `check` without calling it. A nonzero `security-settings-mode` exit,
whatever its cause, leads to `check` with mode reason `committed-settings-unresolved` and the
cause, never to `apply`. `check` never fails on its binding: when the binding does not resolve, it
reads keep-off rows from the working tree and reports `committed-settings-unresolved` itself.

The helper's `apply` enforces the same rules. When the committed settings, or the run named by
`--run-id`, select `check`, it makes no write and reports its entries exactly as `check` would,
with mode `check` and the reason above. It makes no write and exits nonzero naming the cause when
its binding does not resolve, the committed settings are invalid, or the run cannot be read.

Nothing grants turning a setting off. No command writes a value that disables a setting, and the
helper never unpauses paused security updates.

## Reads and writes

Every call goes through `gh api --hostname` with the host of the validated origin.

| Setting | Read | On | Off | Write |
| --- | --- | --- | --- | --- |
| Dependabot alerts | `GET repos/{r}/vulnerability-alerts` | 204 | 404 | `PUT` the same path |
| Dependabot security updates | `GET repos/{r}/automated-security-fixes` | 200 with `enabled` true | 404, or 200 with `enabled` false | `PUT` the same path |
| Secret scanning, push protection | `GET repos/{r}`, `security_and_analysis` | status `enabled` | any other status | `PATCH repos/{r}` with `security_and_analysis` |

An HTTP success alone never means on. Alerts are written and read back first, and security updates
are tried only once alerts read back as on. The helper calls no `code-scanning` endpoint.

## States

| State | Meaning |
| --- | --- |
| `already-on` | On before any write. Reason `renovate-overlap` for security updates beside Renovate, `owner-choice-conflict` when the keep-off list names it, or `paused` when security updates read `paused` true |
| `enabled` | Off before, written, and read back as on |
| `left-off` | Deliberately not enabled: `renovate-present`, `renovate-unknown`, `renovate-detection-failed`, `dependabot-detection-failed` or `owner-choice` |
| `unavailable` | Not free for this repository: `not-free-on-private` or `archived` |
| `not-changed` | Off and free, but not written or not read back as on: `check-only`, `alerts-off`, or `api-error` with the HTTP status |
| `unknown` | Not read: `needs-admin`, or `api-error` with the status or error |

Entries with `renovate-overlap`, `owner-choice-conflict` or `paused` go to the owner. The Markdown
lists them under "Owner decisions", or "None.". The helper changes none of them.

## Rules, in order

The helper first reads `repos/{r}`. When that fails, all four entries are `unknown` with
`api-error`, it makes no other call, and it exits 1. Otherwise each entry takes the state of the
first rule that applies:

1. Archived: every entry is `unavailable` with `archived`, with no admin-only read and no write.
2. Private or internal, on github.com only: secret scanning and push protection are `unavailable`
   with `not-free-on-private` unless the read shows them on, and are never written. An entry read
   as on goes to rule 5 or 7. The `code_scanning` entry is `unavailable` only when the caller is
   admin and `security_and_analysis` shows neither `advanced_security` nor `code_security`
   `enabled`; when either is, there is no `code_scanning` entry. On another host there is no
   `code_scanning` entry, and these settings read as off are `not-changed` with `check-only`.
3. Not admin: every remaining entry is `unknown` with `needs-admin`, with no admin-only read and
   no write.
4. Failed read: a failed read of a setting's state, other than the 404 that means off, makes the
   entry `unknown` with `api-error`, and it is not written.
5. Keep-off list: a setting listed for the repository in `security_settings_keep_off` is never
   written. It is `left-off` with `owner-choice` and the listed reason, or `already-on` with
   `owner-choice-conflict` when it reads as on. Listing `dependabot_alerts` also keeps security
   updates off; listing `secret_scanning` also keeps push protection off.
6. Renovate and Dependabot, for security updates, in the table below. Only the row that writes falls
   through to rules 7 to 10.
7. Already on: `already-on`, with `paused` for paused security updates.
8. Check mode: under `check`, an off and free entry is `not-changed` with `check-only`.
9. Alerts off: under `apply`, security updates are `not-changed` with `alerts-off` when alerts do
   not read back as on, and are not written.
10. Failed write: `not-changed` with `api-error` and the status, or with "not on after write" when a
    successful write does not read back as on. The other settings are still processed.

## Renovate and Dependabot

Renovate is present when the target's own default branch has a config file at a location Renovate
documents (`renovate.json`, `renovate.jsonc` or `renovate.json5` at the root, under `.github/` or
under `.gitlab/`, `.renovaterc`, `.renovaterc.json`, `.renovaterc.jsonc`, `.renovaterc.json5`, or a
`renovate` key in the root `package.json`), when a pull request in any state is authored by
`app/renovate`, or when an open issue by `app/renovate` has "Dependency Dashboard" in its title.
The output names what matched. Detection looks only for the Renovate App's login, not the sweep's
`bot_authors`. Dependabot is configured when `.github/dependabot.yml` or `.github/dependabot.yaml`
exists there. A 404 for a config file means it is absent; any other failed lookup counts as failed.

| Renovate | Dependabot | Security updates off | Security updates on |
| --- | --- | --- | --- |
| present | any | `left-off`, `renovate-present` | `already-on`, `renovate-overlap` or `paused` |
| no signal | configured | written, then `enabled` | `already-on` |
| no signal | not configured | `left-off`, `renovate-unknown` | `already-on` |
| a lookup failed, no match | any | `left-off`, `renovate-detection-failed` | `already-on` |
| no signal | lookup failed | `left-off`, `dependabot-detection-failed` | `already-on` |

Renovate reads Dependabot alerts to open its security pull requests, so alerts are turned on whether
or not Renovate is present. Security updates are left off beside Renovate, and also when neither
tool is configured, so a repository the Renovate App covers gets no duplicate pull requests before
its first Renovate pull request.

## In a maintenance sweep

The maintenance skill runs `security-settings-mode` and then the helper for each repository in
scope, before collection. It saves each JSON in the run's private journal directory and passes the
files to `collect` and `report` with `--security-settings`, and each repository run in `apply` to
`collect` with `--applied-repository`. A helper failure or exit 1 never blocks collection. The
recorded run is the intent for the helper's writes and its saved JSON is their receipt. The
collector rules and the report section are in [maintenance.md](maintenance.md).

## In onboarding

Onboarding runs the helper in the mode above and reports it beside the merged-branch deletion
check, as [loop.md](loop.md) describes. It is a repository change, not a commit, so it never holds
up the onboarding commit.
