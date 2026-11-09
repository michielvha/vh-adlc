---
status: draft
status_description: "Revised for review R-1 with the owner's answers and leaner direction; waits for a new spec review and acceptance."
issue: https://github.com/michielvha/vh-adlc/issues/62
goal: "An owner can opt in to a named browser profile bound to their identity, so provider sessions survive the end of a remote-gui session, while credential entry stays human-only and agent control of a signed-in profile always rests on the owner's confirmation."
covers:
  - plugins/remote-gui/
  - tests/remote-gui/
---

# Plan: Reusable owner-bound browser profiles for remote-gui

Let an owner keep a named remote-gui browser profile between sessions, bound to their identity, with single-writer locking, private storage and deletion, as a complement to auth-refresh.

## Context

### Owner summary

Every remote-gui browser session today starts from an empty profile and deletes it on stop or expiry. When a sign-in has to happen in the shared browser, the owner signs in again each time the viewer expires, often with MFA.

auth-refresh and remote-gui serve different purposes and work together. auth-refresh keeps configured identities current and drives sign-in end to end, so the agent handles most sign-ins. remote-gui is for the cases auth-refresh cannot drive, or when the owner needs to see a UI themselves. This feature makes that second case less repetitive and adds no machinery that overlaps with auth-refresh.

`start --profile <name>` opens a named profile that belongs to the session's pinned owner. It survives stop and expiry; downloads, the X display, viewer access and the other per-session files are still deleted. Without `--profile`, behavior is unchanged. A profile has one writer at a time: a second session asking for a profile in use is refused with the holder's session ID before anything starts. A crashed session's locks are recovered only after remote-gui confirms its processes are gone. A profile opens only for the owner and transport kind it was created with. `profile list` shows profiles and `profile delete` removes one that is not in use. There is no automatic retention: providers expire their own sessions, and the owner deletes a profile when it is no longer wanted.

Credential entry stays human. A session on a reused profile starts in human mode by default, and the agent gets control through the existing confirmed handoff. For unattended work, the owner can allow an agent-mode start with `--agent-start-approved`, which the skill passes only on the owner's instruction in the current task. A sign-in or MFA challenge in agent mode still requires a handoff to human mode first. Reuse never claims a provider session is valid.

Profile files are protected by private permissions only, which the README states: anyone with the owner's OS account or root can read them. A new session starts on the connection page without the previous session's tabs or session-only cookies; persistent cookies and site storage carry over.

Validation is planned, not run: lock, ownership and name tests, real-browser tests for cookie reuse, absent tabs and session cookies, crash recovery after SIGKILL and download placement, plus deletion and auth-refresh sentinel checks. The owner answered the original four questions and the review R-1 questions on 2026-11-09. On review, the owner chose a leaner design: no retention expiry and no auth-refresh path checks. R-1 found two blocking gaps that this revision addresses; a new review is pending. Acceptance authorizes implementation on a feature branch; publication, merge and release stay separate approvals.

### Background

- Each browser session creates `<home>/<id>/profile` with `os.Mkdir`, which fails if it exists, and writes a whole new `Default/Preferences` file that disables the password manager and credential service, points downloads at the session's `downloads` directory and sets `restore_on_startup` to 1 (`plugins/remote-gui/internal/browser/browser.go:303-321`).
- Stop sends SIGTERM to every owned child, then SIGKILL after three seconds, and deletes `profile`, `downloads`, `Xauthority` and `vnc.passwd` (`plugins/remote-gui/internal/browser/browser.go:219-260`). The session record `state.json` stays in the session directory and stopped records remain visible to `status` and `cleanup` (`plugins/remote-gui/internal/state/state.go:173-216`, `plugins/remote-gui/internal/session/daemon.go:641-658`). Only the handoff closes Chromium gracefully, through the owned x11vnc connection and the native Exit menu (`plugins/remote-gui/internal/browser/quit.go:19-29`).
- Chromium starts with `--user-data-dir`, `--restore-last-session` and `--password-store=basic`, and without sync or extensions (`plugins/remote-gui/internal/browser/phase.go:20-32`). Agent mode adds `--enable-automation` and loopback remote debugging (`plugins/remote-gui/internal/browser/phase.go:33-35`). Human mode rejects automation and debugging arguments (`plugins/remote-gui/internal/browser/phase.go:54-55`).
- The human-login feature configures native last-session restore from the first launch so session cookies and tab storage survive an in-session handoff (`docs/specs/remote-gui-human-login.md:131`, with its source S4 on the `RestoreOnStartup` setting). In a profile that is kept, the same setting would also restore the previous session at the next session's first launch.
- The session state root defaults to `$XDG_STATE_HOME/remote-gui/sessions`, or `~/.local/state/remote-gui/sessions`, and `REMOTE_GUI_HOME` or `--home` override it (`plugins/remote-gui/internal/config/config.go:33-43`, `:65`).
- State uses an exclusive non-blocking `flock` on a private `.lock` file (`plugins/remote-gui/internal/state/state.go:105-132`), records the pinned `owner_login` (`plugins/remote-gui/internal/state/state.go:43`) and identifies processes by PID plus birth metadata (`plugins/remote-gui/internal/state/state.go:280-320`).
- `session.Start` creates the session record and spawns the guard before any browser work (`plugins/remote-gui/internal/session/session.go:150-170`), and `browser.Start` retries its runtime up to three times (`plugins/remote-gui/internal/browser/browser.go:284-301`). The guard already reserves a descriptor before startup and passes it to its supervisor (`docs/specs/remote-gui.md:101`, `plugins/remote-gui/internal/session/daemon.go:274`).
- A handoff refuses to relaunch while Chromium's `SingletonLock` remains in the profile (`plugins/remote-gui/internal/browser/phase.go:145-147`). Browser children are started without a separate process group (`plugins/remote-gui/internal/browser/browser.go:148`), so Chromium can outlive a killed supervisor.
- The original remote-gui feature recorded the owner's choice to delete the temporary profile on stop (`docs/specs/remote-gui.md:37`), excluded profile import and export (`docs/specs/remote-gui.md:47`) and refused a caller's existing profile (`docs/specs/remote-gui.md:63`). This feature adds a remote-gui-owned profile; import of other profiles stays excluded.
- Remote-gui must not read auth-refresh credentials, reuse its profiles or operate its lanes (`docs/specs/remote-gui.md:89`). Root and the runtime's own OS account are trusted host administrators, not an isolation boundary (`docs/specs/remote-gui.md:99`). auth-refresh keeps its configuration in `~/.config/auth-refresh/` and its runtime state, including lane browser profiles, in `~/.local/share/auth-refresh/` [S1].

## Scope

In scope:

- `start --profile <name>` for browser sessions on both transports, binding a new profile to the session's owner.
- A profile store under remote-gui's state, separate from session directories.
- Single-writer locking taken before the session starts, with crash recovery by process identity, including Chromium's own singleton files.
- A graceful Chromium close on stop and expiry for sessions with a reusable profile.
- Owner binding: a profile opens only for its recorded owner and transport kind.
- `profile list` and `profile delete <name>`.
- Human-only credential entry on reused profiles, with a human-mode default start and an explicit owner-approved agent start.
- README and skill updates that present auth-refresh and remote-gui as complementary.

Out of scope:

- Automatic retention or expiry of profiles.
- Path checks against auth-refresh directories, beyond keeping remote-gui's default store outside them.
- Importing or exporting cookies or profiles, including from the owner's personal browsers or auth-refresh lanes.
- Sharing a profile between owners, between transport kinds, or between concurrent sessions.
- Persisting downloads, the password manager, extensions or sync.
- Keeping provider sessions alive, refreshing them, or detecting whether a provider still considers a session valid.
- Service shares.
- Changes to the default disposable behavior when `--profile` is absent.

## Design

### Commands

- `start --profile <name>` opens or creates the named profile. Names must match `^[a-z0-9][a-z0-9-]{0,39}$`; any other name fails with `invalid-profile-name` before any file is touched. A new profile is bound to the session's resolved owner login for Tailscale, or to the transport kind `loopback` with an empty owner login. Opening a profile whose recorded owner or transport kind differs from the session's fails with `profile-owner-mismatch` before the session record is created.
- `profile list` prints secret-free JSON with each profile's name, owner login, transport kind, created and last-used times, and `in_use` with the holding session ID.
- `profile delete <name>` takes the profile lock, then removes the profile directory. It fails with `profile-in-use` and the holder's session ID while a session holds it. Repeated deletes return `missing` and exit 0, matching `stop`.
- `status` and `access` report `profile: <name>` for a session with a profile. Without `--profile`, output is unchanged.

### Storage

Profiles live at `$XDG_STATE_HOME/remote-gui/profiles/<name>/`, or `~/.local/state/remote-gui/profiles/<name>/`, beside the default sessions root. `REMOTE_GUI_PROFILE_HOME` or `--profile-home` overrides the profile root. When `REMOTE_GUI_HOME` or `--home` overrides the sessions root, `--profile` fails with `profile-home-required` unless a profile root override is also given. The default root is outside auth-refresh's default directories [S1]; remote-gui does not check override paths against them.

Each profile has:

- `meta.json` (0600): name, owner login, transport kind, created and last-used times, the Chromium major version that last opened it, and while in use the holder's session ID and guard identity.
- `chromium/` (0700): the Chromium user data directory.
- `.lock` (0600): the single-writer lock file.

The store root, each profile directory, `meta.json`, `.lock` and `chromium/` are 0700 directories or 0600 files, checked with the existing `private` helper and opened without following symlinks. Paths Chromium creates inside `chromium/`, including its singleton symlinks, are Chromium's own.

Before each Chromium launch, remote-gui merges its controlled keys into the existing `chromium/Default/Preferences` instead of replacing the file: password manager and credential service off, downloads to this session's `downloads` directory, and the startup setting for that launch (see Lifecycle). Every other preference Chromium saved is kept. Downloads stay per session and are deleted on stop.

Chromium keeps the `--password-store=basic` argument. The design relies on no keyring: it treats profile files as readable by anyone with the runtime's OS account or root, and the README says so. Reusable profiles therefore work on headless hosts.

### Single writer

The CLI takes an exclusive `flock` on the profile's `.lock` before it creates the session record. A held lock fails at once with `profile-in-use` and the holder's session ID from `meta.json`, and nothing is created or started. The CLI passes the locked descriptor to the guard, the way the guard already receives its reserved listener, and the guard holds it for the session's whole life, across the browser start retries. The lock is released when the guard exits.

After taking the lock, the CLI checks `meta.json`. A holder recorded there whose guard identity is no longer alive is cleared and the recovery is noted in the new session's record. Before Chromium launches, remote-gui checks Chromium's `SingletonLock`. Chromium writes it as a symlink to `<hostname>-<pid>`. If the hostname is this host's and that PID is dead, or is alive but its command line does not name this profile's `chromium/` directory, remote-gui removes `SingletonLock`, `SingletonSocket` and `SingletonCookie` and continues. Otherwise the start fails with `profile-browser-still-running`, and the owner stops that browser.

### Lifecycle

- First launch in a session: remote-gui sets the startup setting to open the New Tab page instead of the last session, removes the profile's saved `chromium/Default/Sessions` directory, and starts Chromium without `--restore-last-session`, with the marker URL as its only page. Persistent cookies and site storage carry over. The previous session's tabs and session-only cookies do not.
- In-session handoff: before each relaunch, remote-gui sets the startup setting back to last-session restore (`restore_on_startup` 1) and keeps `--restore-last-session`, so handoffs keep tabs, session cookies and tab storage as today.
- Stop and expiry with a reusable profile: remote-gui first closes Chromium gracefully through the existing owned x11vnc Exit path and waits up to eight seconds, then stops the remaining children as today. A browser that does not close in time is terminated as today, and the next start's singleton check recovers its lock. Afterwards `last used` is updated, the profile is kept, and `downloads`, `Xauthority`, `vnc.passwd` and `control.sock` are deleted. The session record stays, so `status`, repeated `stop` and `cleanup` behave as today.
- Before launching, remote-gui reads the installed Chromium's major version with `--version`. A profile last opened by a newer major version is refused with `profile-chromium-newer`, so Chromium never downgrades its data. The owner upgrades Chromium or deletes the profile.
- There is no retention timer. `profile delete` is the only way a profile is removed.

### Sign-in and hand-back

A session on a reused profile starts in human mode when no mode is given. `start --profile <name> --browser-mode agent` fails with `profile-requires-human-start` unless `--agent-start-approved` is also given. The flag applies to that one session and is recorded as `agent_start_approved: true` on its session record; it is never stored on the profile.

The skill passes `--agent-start-approved` only when the owner has explicitly approved agent use of that named profile in the current task. Otherwise it starts in human mode and hands off to the agent only after the owner confirms, as it does today. In either case, a sign-in, MFA or other credential challenge in agent mode requires `handoff <id> --browser-mode human` before any entry, and the agent never enters credentials. The skill states that a reused profile may already be signed in, that the agent must verify the provider page before acting, and that reuse grants no new provider permission.

### Working with auth-refresh

auth-refresh keeps configured identities current and drives their sign-in end to end; the skill keeps routing configured CLI and SSO identities there first. remote-gui profiles are for sign-ins auth-refresh cannot drive and for pages the owner needs to see. remote-gui never reads auth-refresh files, and its default profile store sits outside auth-refresh's directories. The skill tells agents not to open a remote-gui profile for an identity that auth-refresh owns.

### Compatibility

Without `--profile`, every command, record and output stays as it is, and existing records gain no fields. A session with a profile adds `profile` and, when given, `agent_start_approved` to its record and `profile` to `status` and `access` output. Old supervisors predate the flag and never see a profile. `cleanup` behaves as today and does not touch profiles.

### Glossary

| Term | Meaning |
| --- | --- |
| Reusable profile | A named remote-gui browser profile that survives session stop and expiry. |
| Disposable profile | The default per-session profile, deleted on stop or expiry. |
| Profile owner | The Tailscale owner login, or the `loopback` transport kind, recorded when the profile was created. |
| In use | Held by a live session's single-writer lock. |
| Approved agent start | A reused-profile session started in agent mode with `--agent-start-approved` on the owner's explicit instruction. |

## Acceptance Criteria

- [ ] AC-01: Without `--profile`, browser sessions still start with a fresh profile that is deleted on stop and expiry, with unchanged command output and records.
- [ ] AC-02: A persistent cookie set in one `--profile` session is present in a later session on the same profile after the first session stopped. The first session's `downloads`, `Xauthority`, `vnc.passwd` and `control.sock` are gone and its stopped record remains.
- [ ] AC-03: A later session on a reused profile opens with only the connection page: tabs and session-only cookies from the previous session are absent, while handoffs within a session still keep tabs, session cookies and tab storage.
- [ ] AC-04: A second session cannot start on a profile while another live session holds it, gets `profile-in-use` with the holder's session ID, and leaves no record or process behind.
- [ ] AC-05: After the supervisor and Chromium of a profile session are killed with SIGKILL, a new session on the same profile starts and works, while a profile whose Chromium is still running is refused with `profile-browser-still-running`.
- [ ] AC-06: A session pinned to a different owner login, or of a different transport kind, cannot open the profile, and no record or process is created.
- [ ] AC-07: Invalid profile names are refused before any file is touched, and a profile last opened by a newer Chromium major version is refused before launch.
- [ ] AC-08: The profile store's own paths are private to the runtime's OS account and not followed through symlinks, and the README states that a reusable profile is protected only by file permissions and the host account boundary.
- [ ] AC-09: A download in a later session lands in that session's own download directory, and preferences Chromium saved in the profile survive across sessions.
- [ ] AC-10: `profile list` shows each profile with its owner, transport kind, times and holder, `profile delete` removes an idle profile completely and refuses one in use, and `status` and `access` name a session's profile.
- [ ] AC-11: Credential entry on a reused profile happens only in human mode. A reused-profile session starts in human mode unless `--agent-start-approved` is given, and the skill gives the agent control only after a confirmed handoff or on the owner's explicit approval in the current task.
- [ ] AC-12: auth-refresh files stay unread and unchanged by every profile command, and the default profile store lies outside auth-refresh's default directories.
- [ ] AC-13: The README and skill describe reusable profiles with the glossary terms, the opt-in flag, owner binding, locking, deletion, the at-rest protection, the provider expiry limitation, and auth-refresh as the first route for sign-in.
- [ ] AC-14: The module's race tests, vet, pinned lint and tidy checks pass, and service shares, browser phases, owner access and `cleanup` keep their behavior for sessions without a profile.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Run the existing real headed-browser and lifecycle tests without `--profile`; add CLI output and record snapshot tests for `start`, `status`, `access` and `stop` without the flag. |
| AC-02 | Real browser test (`REMOTE_GUI_BROWSER_E2E=1`): a local fixture sets a persistent cookie in session one on profile `t-reuse`; stop; assert the named private files are absent and the stopped record remains; start session two on `t-reuse` and assert the fixture sees the cookie. |
| AC-03 | Real browser test: in session one open an extra fixture tab and set a session-only cookie; hand off human to agent and back, and assert both survive; stop; start session two and assert through CDP after a handoff to agent that only the connection page is open and the fixture sees no session-only cookie. |
| AC-04 | Unit and CLI tests: two concurrent `start --profile` calls produce one success and one `profile-in-use` naming the first session's ID; the loser leaves no session directory, record or child process; the lock stays held across an injected browser start retry. |
| AC-05 | Real browser test: start a profile session, SIGKILL its supervisor, guard and Chromium, then start a new session on the profile and assert ready status and a working viewer. Unit tests for the singleton check: dead PID, live PID of an unrelated process and a foreign hostname, plus a live Chromium on the profile giving `profile-browser-still-running`. |
| AC-06 | Unit tests with injected owner logins and transports: owner mismatch and transport mismatch fail with `profile-owner-mismatch` and create no record or child process. |
| AC-07 | Unit tests: names with `..`, `/`, uppercase, a leading hyphen and 41 characters are refused and the store is unchanged; a `meta.json` recording a newer Chromium major version gives `profile-chromium-newer` before any launch. |
| AC-08 | Unit tests: assert modes on the store root, profile directory, `meta.json`, `.lock` and `chromium/`; replace each with a symlink and assert refusal. Review the README wording against the Storage design. |
| AC-09 | Real browser test: download a fixture file in session two and assert it lands in session two's `downloads`; set an unrelated preference value in session one's `Preferences` and assert it is still present after session two's launch. |
| AC-10 | CLI tests: `profile list` output fields for idle and in-use profiles; delete idle, delete in use, repeated delete; `status` and `access` include `profile`. |
| AC-11 | Unit tests: `--profile` without a mode starts human; `--profile --browser-mode agent` without `--agent-start-approved` fails with `profile-requires-human-start`; with the flag it starts agent mode and the record holds `agent_start_approved`. Native routing fixtures in `tests/remote-gui/native-routing.e2e.test.ts`: without owner approval the agent starts human and hands off only after confirmation; with approval it passes the flag; an agent-mode credential challenge triggers a handoff to human before any entry. |
| AC-12 | Place sentinel files in temporary `~/.config/auth-refresh` and `~/.local/share/auth-refresh` trees with recorded hashes and access times; run the AC-02, AC-04 and AC-10 scenarios; assert the sentinels are unchanged and the default store path is outside both trees. |
| AC-13 | Review the README and skill diff against the glossary and design; run `tests/remote-gui/package.test.ts` and `bun test tests/vh-adlc`. |
| AC-14 | Run `go test -race ./...`, `go vet ./...`, golangci-lint v2.15.0 `config verify` and `run`, and `go mod tidy -diff` in `plugins/remote-gui`, plus the existing `tests/remote-gui` fixtures. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-09 | R-1 | spec | `8ff685a1883330fd0d50536c79788eae4cc0399f` | claude-opus-5-5 | procedural | Blocking startup-restore and stale Chromium lock gaps plus ten should-fix and nit findings. |
| 2026-11-09 | R-2 | spec | `4891dcc7d97e9c725fbef93c83a7413f59321aa8` | claude-opus-5-5 | procedural | Blocking crash-restored session cookies plus eight should-fix and one nit finding. |

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

### R-2

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design (Lifecycle), AC-03, AC-05, Test Plan, Context (Owner summary)
EVIDENCE: Design line 101 says that on a session's first launch "the previous session's tabs and session-only cookies do not" carry over, because remote-gui sets the startup preference to the New Tab page and drops `--restore-last-session`. The owner summary (line 27) and AC-03 state the same thing with no condition. Chromium also restores old session cookies after a crash, whatever the startup preference says. In chromium/src main, chrome/browser/profiles/profile_impl.cc, `ProfileImpl::ShouldRestoreOldSessionCookies()` returns `ExitTypeService::GetLastSessionExitType(this) == ExitType::kCrashed || startup_pref.ShouldRestoreLastSession()`, and `ShouldPersistSessionCookies()` returns true. chrome/browser/sessions/exit_type_service.cc writes `profile.exit_type` = "Crashed" when the profile opens and only replaces it on a clean exit. The design produces non-graceful ends on purpose: a SIGKILLed Chromium (AC-05), and "A browser that does not close in time is terminated" (line 103). After either one, the next session inherits the previous session's session-only cookies, which are often the provider's actual sign-in cookies. Removing `Default/Sessions` stops tab restore but has no effect on cookies. The AC-03 row covers only the graceful stop path, and the AC-05 row checks only that the new session reaches ready. Both can pass while AC-03 is false after a crash.
PROPOSAL: Before each session's first launch, make the Preferences merge also set `profile.exit_type` to "Normal", or delete non-persistent cookies from `chromium/Default/Cookies`. Cite the Chromium source. Extend the AC-05 real-browser test to set a session-only cookie before the SIGKILL and assert that the fixture does not see it in the next session.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design (Lifecycle), AC-02, AC-14
EVIDENCE: Line 103 has stop and expiry wait up to eight seconds for a graceful Chromium close and then "stop the remaining children as today" (another 3 seconds, browser.go:230-244). That close would run in the supervisor's deferred `bundle.Stop()` (daemon.go:419-421). On a stop or expiry the guard sends SIGTERM to the supervisor and SIGKILLs it after 5 seconds (daemon.go:304-318). Its `finish` then calls `stopMembers`, which SIGTERMs every group member, Chromium included, and SIGKILLs any member still alive after about 300 ms (daemon.go:88-118). The `stop` command polls for only 10 seconds and then fails with `session-cleanup-pending` (session.go:302-313). A close that takes more than about 5 seconds therefore ends in a SIGKILL, which triggers F-01. A close near the full budget also makes `stop` report a failure, contrary to line 103's claim that `stop` behaves as today.
PROPOSAL: Fit the graceful close inside the guard's supervisor deadline and the `stop` wait, or extend those deadlines for profile sessions, and state the numbers in Design. Add a test in which Chromium closes slowly, asserting that `stop` reports `stopped` and that the next session sees a clean exit.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design (Commands), AC-06, Test Plan
EVIDENCE: Line 72 says an owner or transport mismatch "fails with `profile-owner-mismatch` before the session record is created", and AC-06 says "no record or process is created". The CLI does not know the Tailscale owner today. `session.Start` takes only the optional `--owner-login` (config.go:60, session.go:131-170). The resolved login comes from `client.ResolveOwner` in the supervisor's `serve` (daemon.go:441-445), and that runs after `BrowserLauncher` has already started Chromium (daemon.go:415). Design names no CLI-side resolution, and it never requires the supervisor's resolved owner to match the profile owner before the viewer is served. If the check is placed where the owner is known today, the signed-in profile opens in Chromium before the check. If the CLI resolves the owner and the supervisor resolves it again, the two results can differ. The AC-06 proof uses only unit tests with injected owner logins, so it cannot catch either ordering.
PROPOSAL: Specify that the CLI resolves the owner through the same LocalAPI check before it locks the profile, and that the supervisor refuses to launch Chromium unless its own resolved owner equals the profile owner. Add a CLI-level AC-06 test against a fake LocalAPI with no `--owner-login`.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Commands), AC-10, Test Plan
EVIDENCE: Line 74 has `profile delete` take the profile lock and remove the directory, refusing only "while a session holds it". The lock belongs to the guard (line 95), and Background line 40 notes that Chromium can outlive its controllers. When the guard is SIGKILLed while Chromium keeps running (the AC-05 setup), the lock is free, so delete removes `chromium/` from under a live browser that is still writing to it. Only `start` runs the `SingletonLock` check (line 97). The design also does not say what happens to a `start` that opened `.lock` before delete unlinked it and acquires that orphaned inode afterwards.
PROPOSAL: Have `profile delete` run the same singleton check and refuse with `profile-browser-still-running`, and have `start` confirm after locking that its `.lock` is still the file at the profile path. Add both cases to the AC-10 row.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Single writer, Commands), AC-04, Test Plan
EVIDENCE: Line 95 has the CLI lock the profile before it creates the session record. The session ID only exists after `state.New` (session.go:150), and the guard identity only after the guard starts (session.go:172). Until the winner writes them to `meta.json`, a concurrent loser finds no current holder there. The AC-04 row still requires the loser's `profile-in-use` to name "the first session's ID". Line 73 also says `profile list` shows `in_use`, but not how it decides that. A probe that briefly takes the lock would make a concurrent `start` fail with a stale or empty holder.
PROPOSAL: Define when the holder ID is written and what the loser reports before it exists, for example `profile-in-use` with `holder: starting`, and say that `profile list` checks the lock without holding it in a way that can refuse a start. Make the AC-04 proof match.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Single writer), Test Plan (AC-05)
EVIDENCE: Line 97 clears singleton files only when the hostname is this host's. In every other case the start fails with `profile-browser-still-running`, "and the owner stops that browser". When the host has been renamed, or the profile was copied or reached from another machine, no browser exists to stop. The only way out is `profile delete`, which loses the sign-ins. The AC-05 row lists "a foreign hostname" next to the recovery cases (dead PID, unrelated live PID) without giving its expected outcome, so the test can assert either result.
PROPOSAL: Give a foreign-host lock its own diagnostic and a documented owner recovery, and state in the AC-05 row which outcome each unit case expects.

FINDING: F-07
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria, Test Plan
EVIDENCE: Several Design behaviors have no criterion or proof: `profile-home-required` and the `REMOTE_GUI_PROFILE_HOME` / `--profile-home` override (line 79), where `profile list` and `profile delete` look for the store when only `--home` is set, and the graceful close on expiry (line 103, a Scope item at line 51). The AC-03 row exercises only an explicit `stop`. Existing fixtures set `REMOTE_GUI_HOME` (tests/remote-gui/native-routing.e2e.test.ts:49), so the AC-11 routing scenarios hit `profile-home-required` unless they also set a profile home, and the Test Plan does not say that they do.
PROPOSAL: Add a criterion and CLI tests for `profile-home-required` and the override, an expiry variant of the AC-03 real-browser test, and a note that the routing fixtures set a profile home.

FINDING: F-08
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Sign-in and hand-back, Working with auth-refresh), AC-11, AC-13
EVIDENCE: The goal says the owner "can opt in to a named browser profile", but Design never says when the skill may pass `--profile` or create a new profile. It covers only `--agent-start-approved` (line 111) and identities owned by auth-refresh (line 115). An agent could open or create any profile on its own initiative. Also, the current skill tells agents "Never delete locks, force a competing launch" (plugins/remote-gui/skills/remote-gui/SKILL.md:53). Design now has remote-gui remove stale Chromium singleton files on its own (line 97), and does not say how the skill's wording changes.
PROPOSAL: State that the skill uses `--profile <name>` only for a profile the owner named in the current task or in persistent instructions, add that to AC-11 and its routing fixtures, and say how the skill's lock wording changes.

FINDING: F-09
KIND: judgement
SEVERITY: should-fix
WHERE: Open Questions, Context (Owner summary)
EVIDENCE: Open Questions says "None.", and line 29 says the owner answered "the original four questions and the review R-1 questions" without saying what they were. R-1 F-10 asked the author to record which answer settled each trade-off, and that is still missing. Only the choices of no retention and no auth-refresh path checks are attributed to the owner. This revision settles further trade-offs: automatic removal of stale Chromium singleton files (line 97), the eight-second close budget (line 103), `profile-home-required` instead of a derived location (line 79), refusing a profile last opened by a newer Chromium (line 104), a human-mode default with a per-session `--agent-start-approved` flag (line 109), and refusing a foreign-host lock (line 97). The standard says every trade-off the document settles is an open question.
PROPOSAL: Note beside each settled choice the owner answer that decided it, and raise any that no answer covers as open questions before acceptance.

FINDING: F-10
KIND: factual
SEVERITY: nit
WHERE: Design (Single writer, Lifecycle), Sources
EVIDENCE: Several claims about Chromium internals have no citation: that `SingletonLock` is a symlink to `<hostname>-<pid>` (line 97), that the saved session lives in `chromium/Default/Sessions` (line 101), and the behavior of the `restore_on_startup` values (lines 101-102). Sources lists only S1 and a page that returned 503. The standard requires Design claims to be cited and Sources to list every external page read.
PROPOSAL: Cite the Chromium sources, for example process_singleton_posix.cc for the lock format, plus profile_impl.cc and exit_type_service.cc for F-01, and add them to Sources.

## Sources

- [S1] auth-refresh `README.md`, Configuration section, read from the local checkout at commit `711028c` (`/home/m/code/auth-refresh`): configuration lives in `~/.config/auth-refresh/` and runtime state, including lane browser profiles, in `~/.local/share/auth-refresh/`, overridable with `AUTH_REFRESH_CONFIG` and `AUTH_REFRESH_HOME`. The marketplace pins auth-refresh at a different commit (`docs/specs/remote-gui.md:39`); the paths are used only to place remote-gui's default store elsewhere.
- [Chromium Linux password storage](https://chromium.googlesource.com/chromium/src/+/main/docs/linux/password_storage.md): returned HTTP 503 during drafting and supports no claim here. The design avoids relying on the basic store's protection.
