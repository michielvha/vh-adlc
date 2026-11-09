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
| 2026-11-09 | R-1 | spec | `8ff685a1883330fd0d50536c79788eae4cc0399f` | claude-opus-5-5 | procedural | Blocking startup-restore and stale Chromium lock gaps plus ten should-fix and nit findings. |

### R-1

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design (Lifecycle), Context (Background), Acceptance Criteria
EVIDENCE: Design line 94 says the first launch drops `--restore-last-session`, "so the previous session's tabs are not restored" and "session-only cookies do not" carry over. Background line 43 repeats this. The profile itself stores the opposite setting. plugins/remote-gui/internal/browser/browser.go:318 writes `"session": {"restore_on_startup": 1}` into Default/Preferences. docs/specs/remote-gui-human-login.md:131 requires that native restore be configured "from its first launch". Its source S4 (the RestoreOnStartup policy, remote-gui-human-login.md:381) describes value 1 as last-session restore with session-cookie retention. Chromium keeps that preference in a reused profile, so session two would restore session one's tabs and session-only cookies whatever the command line says. Design line 84 reasserts the session preferences on each open, which makes the conflict worse. No criterion or Test Plan row checks that tabs and session cookies are absent in a later session, so every box can be ticked while the owner summary's statement (line 27) is false.
PROPOSAL: Specify how a reusable profile's startup preference is set before each session's first launch, while handoffs keep native restore. Add a criterion and a real-browser Test Plan row: a session-only cookie and an extra tab from session one are absent in session two, and in-session handoffs still keep both.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design (Storage)
EVIDENCE: Design line 84 reasserts only "the session profile preferences that disable the password manager". The existing preference write (browser.go:318) also sets `download.default_directory` to the per-session `<session>/downloads` path and sets `restore_on_startup`. On a reused profile, a stored download directory points at the previous session's deleted directory unless it is rewritten on every open. The existing code also writes the whole Preferences file with `os.WriteFile` (browser.go:319). Repeating that on a reused profile would erase every other preference Chromium saved.
PROPOSAL: State that each open merges the controlled keys (password manager, credential service, download directory and startup restore) into the existing Preferences file instead of replacing it. Add a test that a download in session two lands in session two's directory.

FINDING: F-03
KIND: judgement
SEVERITY: blocking
WHERE: Design (Single writer, Lifecycle), AC-03, Test Plan
EVIDENCE: Design line 90 treats a remaining Chromium `SingletonLock` as `browser-profile-still-locked`. It says "the owner resolves it; remote-gui never deletes it", but no command, README text or criterion says how the owner does that. A stale lock is the normal result of a crash. Browser children are spawned with an empty SysProcAttr (browser.go:148), so Chromium can outlive a killed supervisor. Stop sends SIGTERM to every child, including the X server, then SIGKILL after 3 seconds (browser.go:227-244). Stop does not use the graceful Exit path that handoff uses to let Chrome flush its state (quit.go:17-19). A SIGKILLed Chromium leaves `SingletonLock` behind, so the profile refuses every later start. AC-03 promises that such a profile "becomes usable again". The AC-03 Test Plan row has unit tests only, with no real Chromium, so it can pass while a real crashed profile stays unusable.
PROPOSAL: Define a safe recovery for a stale Chromium singleton lock, for example confirming that its recorded host and process are dead or letting Chromium's own stale-lock handling run. Specify a graceful browser close on stop and expiry. Add a real-browser test that kills the supervisor and Chromium with SIGKILL and then starts a session on the same profile.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Design (Lifecycle), Test Plan (AC-02)
EVIDENCE: Design line 95 says "the session directory [is] deleted as today", and the AC-02 row (line 141) asserts "session one's directory is gone". Today stop removes only `profile`, `downloads`, `Xauthority` and `vnc.passwd` (browser.go:255-259; daemon.go:145-151 also removes `control.sock`). The record `state.json` lives in the session directory (state/state.go:180), and stopped records are kept and reported by cleanup (session/daemon.go:656-658). Repeated stops exit 0 against that record (README.md:101). Deleting the directory would change the output that AC-01 requires to stay unchanged.
PROPOSAL: Correct the Lifecycle claim. Change the AC-02 proof to assert that the named private files are absent and that the stopped record remains.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Commands, Single writer), AC-03, AC-04
EVIDENCE: Design line 90 has the supervisor take the profile `flock`. Line 71 requires the owner check "before any process starts", and the AC-03 row expects two concurrent starts to give one success and one `profile-in-use` with the holder's ID. `session.Start` creates the session record and spawns `_guard` before any browser work (session/session.go:150-170), and `browser.Start` retries its runtime three times (browser.go:286-301). Two concurrent CLIs can therefore both pass any pre-launch check. The loser then fails after its guard and supervisor have started, and it surfaces as `session-start-failed: ...` rather than `profile-in-use`.
PROPOSAL: Specify that the CLI acquires the profile lock before it creates the session record and passes the descriptor to the guard or supervisor, as the guard already does with its Unix listener (remote-gui.md:101). State that the lock is held across the start retries.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Context (Owner summary), Design (Lifecycle, Retention), AC-06
EVIDENCE: The owner summary (line 23) says "`cleanup` deletes a profile after 30 idle days by default". `cleanup` runs only when invoked (config/config.go:54, cmd/remote-gui/main.go:48, session/daemon.go:641), and nothing schedules it. The skill uses it only for owned records (skills/remote-gui/SKILL.md:61). An idle signed-in profile can therefore stay on disk indefinitely. AC-06 tests only an explicit `cleanup` call.
PROPOSAL: Either expire profiles on every `start` and `profile` command too, or state in the summary, the README criterion and AC-06 that expiry happens only when `cleanup` runs. Put that choice to the owner.

FINDING: F-07
KIND: factual
SEVERITY: should-fix
WHERE: Context (Background), Test Plan (AC-05), Tasks
EVIDENCE: Line 44 says "T1 measures what a reused profile's cookie database holds and records it before the storage design is finalized". The AC-05 row (line 144) says "Record the T1 measurement". Tasks (line 153) says "None yet". The document therefore asks for acceptance of a Storage design it calls unfinished, and it depends on a task that does not exist. Line 27 ("Chromium's current `basic` password store is not backed by a keyring") and line 43 (which cookies survive across sessions) are external Chromium claims with no citation, and there is no Sources section.
PROPOSAL: Take the measurement now and cite the command and its output in Context, or make the README wording independent of it and drop "before the storage design is finalized". Cite the Chromium claims, for example by reusing the human-login sources S4 and S5.

FINDING: F-08
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria, Test Plan
EVIDENCE: Several Design behaviors have no criterion or proof row: the `profile-chromium-newer` refusal (line 96), profile name validation against `^[a-z0-9][a-z0-9-]{0,39}$` (line 71), the `profile list` fields with `in_use` and the holding session ID (line 72), the `profile: <name>` field in `status` and `access` (line 74), the holder's session ID in `profile-in-use` (line 90), and whether the stored `--profile-retention` persists on reopen (line 97). Name validation is what keeps profile names from becoming path traversal, and AC-05 covers only symlinks.
PROPOSAL: Add criteria for these end states and Test Plan rows naming their checks, including a downgrade refusal test with a recorded newer major version and rejected names.

FINDING: F-09
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Storage, Separation from auth-refresh), AC-08, Test Plan
EVIDENCE: Line 78 lets `REMOTE_GUI_PROFILE_HOME` or `--profile-home` put the store anywhere. Line 107 says the store "never resolves inside auth-refresh's state", and the AC-08 row asserts "the store root is outside the auth-refresh tree". The document never says where auth-refresh's state lives. auth-refresh is not in this repository (`ls plugins` lists codex-qr-pairing, github-app-registration, remote-gui, vh-adlc), and searching docs/specs for an auth-refresh state path finds none. As written, the check cannot be implemented or observed, and an override can point the store into auth-refresh's directories.
PROPOSAL: Name the auth-refresh state roots the check uses, and specify that a profile-home override resolving inside them is refused. Add that refusal to AC-08 and its test row.

FINDING: F-10
KIND: judgement
SEVERITY: should-fix
WHERE: Open Questions, Context (Owner summary)
EVIDENCE: Open Questions says "None.", and line 31 says the owner answered "the four design questions" without saying which they were. The document settles further trade-offs that do not trace to any recorded answer: no tab or session restore across sessions (line 94), refusing profiles opened by a newer Chromium (line 96), leaving a stale `SingletonLock` to the owner (line 90), placing profiles beside a custom `REMOTE_GUI_HOME` (line 78), profiles that cannot move between loopback and Tailscale owners (line 71), and retention that runs only on `cleanup` (line 97). The standard says every trade-off the document settles is an open question.
PROPOSAL: Record which owner answer settled each of these. Raise the rest as open questions before acceptance.

FINDING: F-11
KIND: judgement
SEVERITY: nit
WHERE: Design (Storage)
EVIDENCE: Line 78 handles only `REMOTE_GUI_HOME`, but `--home` also sets the sessions root (config/config.go:65). Profiles "in a `profiles` directory beside that sessions root" means a generic `profiles` directory in the parent of whatever path the caller chose, for example `$HOME/profiles` for `REMOTE_GUI_HOME=$HOME/rg`. Nothing guarantees that parent directory is private.
PROPOSAL: Define the derived location for `--home` as well, and use a remote-gui-specific name or require an explicit profile home when the sessions root is overridden.

FINDING: F-12
KIND: factual
SEVERITY: nit
WHERE: Design (Compatibility, Storage, Sign-in), AC-05, AC-10
EVIDENCE: Compatibility (line 111) says a profile adds only an optional `profile` field to new records, but line 101 also records `--agent-start-approved` on the session record. The `meta.json` field list (line 80) omits the holder session ID and supervisor identity (line 90) and the idle period (line 97). AC-10 says cleanup "keep[s] [its] behavior" while AC-06 changes it. AC-05 says "no profile path follows a symlink", yet Chromium creates its own `SingletonLock`, `SingletonSocket` and `SingletonCookie` symlinks inside the user data directory.
PROPOSAL: Make the record and `meta.json` field lists complete, limit AC-10 to unchanged behavior outside profiles, and scope AC-05 to the store's own paths (store root, profile directory, `meta.json`, `.lock`, `chromium/`).
