---
status: draft
status_description: "Owner answers folded; waits for an independent spec review and acceptance."
issue: https://github.com/michielvha/vh-adlc/issues/62
goal: "An owner can opt in to a named browser profile bound to their identity, so provider sessions survive the end of a remote-gui session, while credential entry stays human-only and agent control of a signed-in profile always rests on the owner's confirmation."
covers:
  - plugins/remote-gui/
  - tests/remote-gui/
---

# Plan: Reusable owner-bound browser profiles for remote-gui

Let an owner keep a named remote-gui browser profile between sessions, bound to their Tailscale identity, with single-writer locking, private storage, retention and deletion, and no overlap with auth-refresh.

## Context

### Owner summary

Every remote-gui browser session today starts from an empty profile and deletes it on stop or expiry. The owner signs in to the same provider again each time the viewer expires, often with MFA.

This feature adds an opt-in named profile. `start --profile <name>` opens a profile that belongs to the session's pinned owner login. It survives stop and expiry; downloads, the X display and viewer access stay per session and are still deleted. Without `--profile`, behavior is unchanged: a fresh disposable profile.

A profile has one writer at a time. A second session asking for a locked profile is refused with the holder's session ID, and a crashed holder's lock is recovered only after its recorded process identity is confirmed dead. A profile bound to one owner cannot be opened by a session pinned to another. New commands list and delete profiles, and a deletion refuses while the profile is in use. `cleanup` deletes a profile after 30 idle days by default; the owner can set up to 90.

Credential entry stays human. A session on a reused profile starts in human mode by default, and the agent gets control through the existing confirmed handoff. For unattended work, the owner can instead allow an agent-mode start with an explicit `--agent-start-approved` flag, which the skill passes only on the owner's instruction in the current task. Any sign-in or MFA challenge in agent mode still requires a handoff to human mode first. Reuse never claims a provider session is valid; providers may still expire it or ask for MFA again.

Profile files are protected by a private directory and file permissions. Chromium's current `basic` password store is not backed by a keyring, so a reused profile's cookies are as protected as the owner's OS account and no more. The owner accepted that boundary, and the README states it. A new session does not restore the previous session's tabs: persistent cookies and site storage carry over, and session-only cookies do not.

Profiles live under remote-gui's own state root, never inside auth-refresh's directories, and remote-gui never imports from or exports to auth-refresh or the owner's personal browser profiles.

Validation is planned, not run: lock and ownership unit tests, a real browser test that keeps a persistent cookie across two sessions, crash recovery, retention and deletion tests, and auth-refresh sentinel checks. The owner answered the four design questions on 2026-11-09; no review has run yet. Acceptance authorizes implementation on a feature branch; publication, merge and release stay separate approvals.

### Background

- Each browser session creates `<home>/<id>/profile` with `os.Mkdir`, which fails if it exists, and writes fresh preferences that disable the password manager and set `restore_on_startup` (`plugins/remote-gui/internal/browser/browser.go:303-321`).
- Stop deletes `profile`, `downloads`, `Xauthority` and `vnc.passwd` from the session directory (`plugins/remote-gui/internal/browser/browser.go:255-259`).
- Chromium starts with `--user-data-dir`, `--restore-last-session` and `--password-store=basic`, and without sync or extensions (`plugins/remote-gui/internal/browser/phase.go:20-32`). Agent mode adds `--enable-automation` and loopback remote debugging (`plugins/remote-gui/internal/browser/phase.go:33-35`). Human mode rejects automation and debugging arguments (`plugins/remote-gui/internal/browser/phase.go:54-55`).
- The session state root defaults to `$XDG_STATE_HOME/remote-gui/sessions`, or `~/.local/state/remote-gui/sessions`, and `REMOTE_GUI_HOME` or `--home` override it (`plugins/remote-gui/internal/config/config.go:33-43`, `:65`).
- State uses an exclusive non-blocking `flock` on a private `.lock` file (`plugins/remote-gui/internal/state/state.go:105-132`), records the pinned `owner_login` (`plugins/remote-gui/internal/state/state.go:43`) and identifies processes by PID plus birth metadata (`plugins/remote-gui/internal/state/state.go:280-320`).
- A handoff refuses to relaunch while Chromium's `SingletonLock` remains in the profile (`plugins/remote-gui/internal/browser/phase.go:145-147`).
- The original remote-gui feature recorded the owner's choice to delete the temporary profile on stop (`docs/specs/remote-gui.md:37`), excluded profile import and export (`docs/specs/remote-gui.md:47`) and refused a caller's existing profile (`docs/specs/remote-gui.md:63`). This feature adds a remote-gui-owned profile; import of other profiles stays excluded.
- Remote-gui must not read auth-refresh credentials, reuse its profiles or operate its lanes (`docs/specs/remote-gui.md:89`). Root and the runtime's own OS account are trusted host administrators, not an isolation boundary (`docs/specs/remote-gui.md:99`).
- The human-login feature restores session cookies and tab storage only within one remote-gui session through native session restore (`docs/specs/remote-gui-human-login.md:131`). Across sessions, only persistent cookies and site storage survive unless the previous session is restored, which this feature does not do.
- `--password-store=basic` selects Chromium's built-in store instead of a desktop keyring. This document does not cite an external description of its on-disk protection because the Chromium documentation page returned HTTP 503 during drafting. T1 measures what a reused profile's cookie database holds and records it before the storage design is finalized.

## Scope

In scope:

- `start --profile <name>` for browser sessions on both transports, binding a new profile to the session's owner.
- A profile store under remote-gui's state, separate from session directories and from auth-refresh.
- Single-writer locking with crash recovery by process identity.
- Owner binding: a profile opens only for its recorded owner login, or its OS account in loopback mode.
- `profile list`, `profile delete <name>` and retention expiry handled by `cleanup`.
- Human-only credential entry on reused profiles, with a human-mode default start and an explicit owner-approved agent start.
- README and skill updates.

Out of scope:

- Importing or exporting cookies or profiles, including from the owner's personal browsers or auth-refresh lanes.
- Sharing a profile between owners, or between concurrent sessions.
- Persisting downloads, the password manager, extensions or sync.
- Keeping provider sessions alive, refreshing them, or detecting whether a provider still considers a session valid.
- Service shares.
- Changes to the default disposable behavior when `--profile` is absent.

## Design

### Commands

- `start --profile <name>` opens or creates the named profile. Names match `^[a-z0-9][a-z0-9-]{0,39}$`. A new profile is bound to the session's resolved owner login (Tailscale) or to the OS account with `owner_login` empty (loopback). Opening an existing profile whose owner differs from the session's owner fails with `profile-owner-mismatch` before any process starts.
- `profile list` prints secret-free JSON: name, owner login, created, last used, retention deadline, and `in_use` with the holding session ID.
- `profile delete <name>` removes the profile directory and its metadata after taking the profile lock. It fails with `profile-in-use` while a session holds it. Repeated deletes return `missing` and exit 0, matching `stop`.
- `status` and `access` for a session report `profile: <name>` when one is attached. Without `--profile`, output is unchanged.

### Storage

Profiles live at `$XDG_STATE_HOME/remote-gui/profiles/<name>/`, beside the sessions root, with `REMOTE_GUI_PROFILE_HOME` or `--profile-home` as overrides. When `REMOTE_GUI_HOME` is set without a profile override, profiles live in a `profiles` directory beside that sessions root. Each profile has:

- `meta.json` (0600): name, owner login, created, last used, retention deadline and the Chromium major version that last opened it.
- `chromium/` (0700): the Chromium user data directory.
- `.lock` (0600): the single-writer lock file.

Directories are 0700 and files 0600, checked with the existing `private` helper. The store never follows symlinks. Downloads remain at `<session>/downloads` and are deleted on stop. The session profile preferences that disable the password manager are written on creation and reasserted on each open.

Chromium keeps the `basic` password store. File permissions and the host trust boundary protect the profile, and the README says plainly that anyone with the owner's OS account or root can read its cookies. No keyring is required, so reusable profiles work on headless hosts.

### Single writer

The supervisor holds an exclusive `flock` on the profile's `.lock` for the session's whole life and writes its session ID and supervisor identity into `meta.json`. A second `start --profile` for the same name fails with `profile-in-use` and the holder's session ID. If the lock is free but `meta.json` names a holder, the holder's recorded identity is checked with `state.Alive`; a dead holder is cleared and recorded as recovered. A remaining Chromium `SingletonLock` with no live owned browser is treated as the existing `browser-profile-still-locked` failure, and the owner resolves it; remote-gui never deletes it.

### Lifecycle

- First launch in a session: Chromium opens the profile with the marker URL and without `--restore-last-session`, so the previous session's tabs are not restored. Persistent cookies and site storage carry over; session-only cookies do not. In-session handoffs keep using native restore as today.
- Stop and expiry: Chromium closes, the lock is released, `last used` and the retention deadline are updated, and the profile is kept. Downloads, X authority, the VNC password and the session directory are deleted as today.
- A profile last opened by a newer Chromium major version than the installed one is refused with `profile-chromium-newer`, so Chromium never downgrades its data.
- Retention: each open sets the deadline to last use plus the idle period, 30 days by default. `start --profile <name> --profile-retention <duration>` sets the profile's idle period, between 1 day and 90 days, and stores it in `meta.json`. `cleanup` deletes unlocked profiles whose deadline has passed.

### Sign-in and hand-back

A session on a reused profile starts in human mode when no mode is given. `start --profile <name> --browser-mode agent` fails with `profile-requires-human-start` unless `--agent-start-approved` is also given. The flag applies to that one session and is recorded on its session record; it is never stored on the profile.

The skill passes `--agent-start-approved` only when the owner has explicitly approved agent use of that named profile in the current task. Otherwise it starts in human mode and hands off to the agent only after the owner confirms, as it does today. In either case, a sign-in, MFA or other credential challenge in agent mode requires `handoff <id> --browser-mode human` before any entry, and the agent never enters credentials. The skill states that a reused profile may already be signed in, that the agent must verify the provider page before acting, and that reuse grants no new provider permission.

### Separation from auth-refresh

The profile store is a remote-gui path. It never resolves inside auth-refresh's state, and no code path reads auth-refresh files. The skill keeps routing configured CLI and SSO identities to auth-refresh and tells agents not to use a remote-gui profile for an identity auth-refresh owns. Tests place auth-refresh sentinel files and assert they are unread and unchanged.

### Compatibility

Without `--profile`, every command, record and output stays as it is. Existing session records gain no fields. A profile attaches an optional `profile` field to new records only. Old supervisors ignore profiles because they predate the flag.

### Glossary

| Term | Meaning |
| --- | --- |
| Reusable profile | A named remote-gui browser profile that survives session stop and expiry. |
| Disposable profile | The default per-session profile, deleted on stop or expiry. |
| Profile owner | The Tailscale owner login, or the OS account in loopback mode, recorded when the profile was created. |
| In use | Held by a live session's single-writer lock. |
| Approved agent start | A reused-profile session started in agent mode with `--agent-start-approved` on the owner's explicit instruction. |

## Acceptance Criteria

- [ ] AC-01: Without `--profile`, browser sessions still start with a fresh profile that is deleted on stop and expiry, with unchanged command output.
- [ ] AC-02: A persistent provider cookie set in one `--profile` session is present in a later session on the same profile after the first session stopped, while that session's downloads, X authority and VNC password are gone.
- [ ] AC-03: A second session cannot open a profile while another live session holds it, and a profile held by a crashed session becomes usable again only after the holder's recorded process identity is confirmed dead.
- [ ] AC-04: A session pinned to a different owner login, or a loopback session for a Tailscale-bound profile, cannot open the profile, and nothing is launched.
- [ ] AC-05: Profile directories and files are private to the runtime's OS account, no profile path follows a symlink, and the README states that a reusable profile is protected only by file permissions and the host account boundary.
- [ ] AC-06: `profile delete` removes an idle profile completely, refuses one in use, and `cleanup` removes profiles past their retention deadline (30 idle days by default, configurable from 1 to 90) while keeping profiles in use or within retention.
- [ ] AC-07: Credential entry on a reused profile happens only in human mode. A reused-profile session starts in human mode unless `--agent-start-approved` is given, and the skill gives the agent control only after a confirmed handoff or on the owner's explicit approval in the current task.
- [ ] AC-08: Auth-refresh state and lanes stay unread and unchanged, and no remote-gui profile is created inside them.
- [ ] AC-09: The README and skill describe reusable profiles with the glossary terms, the opt-in flag, owner binding, locking, retention, deletion, the at-rest protection and the provider expiry limitation.
- [ ] AC-10: The module's race tests, vet, pinned lint and tidy checks pass, and existing service shares, phases, owner access and cleanup keep their behavior.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Run the existing real headed-browser and lifecycle tests without `--profile`; add a CLI output snapshot test for `start`, `status` and `access` without the flag. |
| AC-02 | Real browser test (`REMOTE_GUI_BROWSER_E2E=1`): a local fixture sets a persistent cookie in session one on profile `t-reuse`; stop; start session two on `t-reuse`; assert the fixture sees the cookie; assert session one's directory is gone. |
| AC-03 | Unit tests: two concurrent `start --profile` calls produce one success and one `profile-in-use`; a holder killed with SIGKILL and a holder whose PID was reused by a foreign process are distinguished by birth identity; recovery happens only for the dead holder. |
| AC-04 | Unit tests with injected owner logins: owner mismatch and transport mismatch fail with `profile-owner-mismatch` and start no child process. |
| AC-05 | Unit tests: assert modes on the store, profile, `meta.json` and `.lock`; replace a profile path with a symlink and assert refusal. Record the T1 measurement of the cookie database's protection in evidence and review the README wording against it. |
| AC-06 | Unit and CLI tests: delete idle, delete in use, repeated delete, and `cleanup` with expired, unexpired and locked profiles using an injected clock; the default deadline is 30 days, and `--profile-retention` accepts 1 to 90 days and rejects values outside that range. |
| AC-07 | Unit tests: `--profile` without a mode starts human; `--profile --browser-mode agent` without `--agent-start-approved` fails with `profile-requires-human-start`; with the flag it starts agent mode. Native routing fixtures in `tests/remote-gui/native-routing.e2e.test.ts`: a task with no owner approval starts human and hands off only after confirmation; a task where the owner approved an agent start passes the flag; an agent-mode credential challenge triggers a handoff to human before any entry. |
| AC-08 | Place auth-refresh sentinel files with recorded hashes and access times; run the AC-02 and AC-06 scenarios; assert sentinels are unchanged and the store root is outside the auth-refresh tree. |
| AC-09 | Review the README and skill diff against the glossary and design; run `tests/remote-gui/package.test.ts` and `bun test tests/vh-adlc`. |
| AC-10 | Run `go test -race ./...`, `go vet ./...`, golangci-lint v2.15.0 `config verify` and `run`, and `go mod tidy -diff` in `plugins/remote-gui`, plus the existing `tests/remote-gui` fixtures. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
