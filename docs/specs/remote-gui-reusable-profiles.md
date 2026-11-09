---
status: in-progress
status_description: "Claimed for implementation on feat/remote-gui-reusable-profiles."
branch: feat/remote-gui-reusable-profiles
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

`start --profile <name>` opens a named profile that belongs to the session's pinned owner. It survives stop and expiry; downloads, the X display, viewer access and the other per-session files are still deleted. Without `--profile`, behavior is unchanged. A profile has one writer at a time: a second session asking for a profile in use is refused before anything starts. After a crash, remote-gui removes Chromium's leftover lock files on its own once no browser on this host uses the profile. A profile opens only for the owner and transport kind it was created with. `profile list` shows profiles and `profile delete` removes one that is not in use. There is no automatic retention: providers expire their own sessions, and the owner deletes a profile when it is no longer wanted.

Credential entry stays human. A session with `--profile` starts in human mode by default, and the agent gets control through the existing confirmed handoff. For unattended work, the owner can allow an agent-mode start with `--agent-start-approved`, which the skill passes only on the owner's instruction in the current task. A sign-in or MFA challenge in agent mode still requires a handoff to human mode first. Reuse never claims a provider session is valid.

Profile files are protected by private permissions only, which the README states: anyone with the owner's OS account or root can read them. Agents never list, read or copy those files; they reach a profile only through a remote-gui session. When the sessions root is overridden, a profile root must be given too. A profile last opened by a newer Chromium is refused. On stop or expiry remote-gui asks Chromium to exit, then terminates it so it can save recent cookies, and kills it only as a last step, all within the five-second deadline. A new session starts on the connection page without the previous session's tabs or session-only cookies, even after a crash; persistent cookies and site storage carry over. Only sign-ins kept in persistent cookies survive, so the owner should choose a provider's "stay signed in" option, and the skill reminds them when it opens a profile in human mode. The agent opens a profile only when the owner named it.

Validation is planned, not run: lock, ownership and name tests, real-browser tests for cookie reuse, absent tabs and session cookies after a clean stop, an expiry and a SIGKILL, crash recovery and download placement, plus deletion and auth-refresh sentinel checks. The owner's decisions are listed under Design. Reviews R-1 and R-2 found blocking gaps that later revisions addressed; R-3 to R-5 found no blocking gap, and this revision applies their proposals. A final review is pending, and the owner has said to accept the feature if it finds no blocking gap. Acceptance authorizes implementation on a feature branch; publication, merge and release stay separate approvals.

### Background

- Chromium 151 is installed (`$REMOTE_GUI_CHROMIUM --version`). On a scratch profile it wrote `SingletonLock -> fedora-43-4080313`, a symlink to the hostname and PID joined by a hyphen, beside `SingletonCookie` and `SingletonSocket` symlinks; the hostname itself contains a hyphen, so the PID follows the last one. After SIGTERM, all three symlinks were still present (command run 2026-11-09 with `--headless=new --user-data-dir=<scratch>`).
- Each browser session creates `<home>/<id>/profile` with `os.Mkdir`, which fails if it exists, and writes a whole new `Default/Preferences` file that disables the password manager and credential service, points downloads at the session's `downloads` directory and sets `restore_on_startup` to 1 (`plugins/remote-gui/internal/browser/browser.go:303-321`).
- Stop sends SIGTERM to every owned child, then SIGKILL after three seconds, and deletes `profile`, `downloads`, `Xauthority` and `vnc.passwd` (`plugins/remote-gui/internal/browser/browser.go:219-260`). The session record `state.json` stays in the session directory and stopped records remain visible to `status` and `cleanup` (`plugins/remote-gui/internal/state/state.go:173-216`, `plugins/remote-gui/internal/session/daemon.go:641-658`). Only the handoff closes Chromium gracefully, through the owned x11vnc connection and the native Exit menu (`plugins/remote-gui/internal/browser/quit.go:19-29`).
- Chromium starts with `--user-data-dir`, `--restore-last-session` and `--password-store=basic`, and without sync or extensions (`plugins/remote-gui/internal/browser/phase.go:20-32`). Agent mode adds `--enable-automation` and loopback remote debugging (`plugins/remote-gui/internal/browser/phase.go:33-35`). Human mode rejects automation and debugging arguments (`plugins/remote-gui/internal/browser/phase.go:54-55`).
- The human-login feature configures native last-session restore from the first launch so session cookies and tab storage survive an in-session handoff (`docs/specs/remote-gui-human-login.md:131`, with its source S4 on the `RestoreOnStartup` setting). In a profile that is kept, the same setting would also restore the previous session at the next session's first launch. Chromium also restores old session cookies after a crash, whatever the startup setting. Review R-3 (finding F-07) measured this with the host's Chromium 151.0.7922.137 (`--headless=new`, a scratch profile and a local cookie fixture): `profile.exit_type` reads `Crashed` while the browser runs and after a SIGKILL, and relaunching that profile unchanged sent `sess=1; pers=1`. A copy with `exit_type` set to `Normal` and `restore_on_startup` 5 sent only `pers=1`, and a later relaunch with `restore_on_startup` 1 and `--restore-last-session` still sent only `pers=1`. A fresh profile first launched with `restore_on_startup` 5, closed with CDP `Browser.close`, then relaunched with 1 and `--restore-last-session`, kept `sess=1`.
- The session state root defaults to `$XDG_STATE_HOME/remote-gui/sessions`, or `~/.local/state/remote-gui/sessions`, and `REMOTE_GUI_HOME` or `--home` override it (`plugins/remote-gui/internal/config/config.go:33-43`, `:65`).
- State uses an exclusive non-blocking `flock` on a private `.lock` file (`plugins/remote-gui/internal/state/state.go:105-132`), records the pinned `owner_login` (`plugins/remote-gui/internal/state/state.go:43`) and identifies processes by PID plus birth metadata (`plugins/remote-gui/internal/state/state.go:280-320`).
- On stop or expiry the guard sends SIGTERM to the supervisor and SIGKILL after five seconds, then terminates any remaining group member after about 300 ms (`plugins/remote-gui/internal/session/daemon.go:88-118`, `:304-318`). The `stop` command waits ten seconds before reporting `session-cleanup-pending` (`plugins/remote-gui/internal/session/session.go:302-313`).
- The CLI receives only an optional `--owner-login`; the supervisor resolves the Tailscale owner through the LocalAPI after the browser launcher has started (`plugins/remote-gui/internal/config/config.go:60`, `plugins/remote-gui/internal/session/daemon.go:415`, `:441-445`).
- `session.Start` creates the session record and spawns the guard before any browser work (`plugins/remote-gui/internal/session/session.go:150-170`), and `browser.Start` retries its runtime up to three times (`plugins/remote-gui/internal/browser/browser.go:284-301`). The guard already reserves a descriptor before startup and passes it to its supervisor (`docs/specs/remote-gui.md:101`, `plugins/remote-gui/internal/session/daemon.go:274`).
- The existing real-browser fixtures set `REMOTE_GUI_HOME` (`tests/remote-gui/native-routing.e2e.test.ts:49`). The skill tells agents never to delete locks or force a competing launch (`plugins/remote-gui/skills/remote-gui/SKILL.md:53`).
- A handoff refuses to relaunch while Chromium's `SingletonLock` remains in the profile (`plugins/remote-gui/internal/browser/phase.go:145-147`). Browser children are started without a separate process group (`plugins/remote-gui/internal/browser/browser.go:148`), so Chromium can outlive a killed supervisor.
- The original remote-gui feature recorded the owner's choice to delete the temporary profile on stop (`docs/specs/remote-gui.md:37`), excluded profile import and export (`docs/specs/remote-gui.md:47`) and refused a caller's existing profile (`docs/specs/remote-gui.md:63`). This feature adds a remote-gui-owned profile; import of other profiles stays excluded.
- Remote-gui must not read auth-refresh credentials, reuse its profiles or operate its lanes (`docs/specs/remote-gui.md:89`). Root and the runtime's own OS account are trusted host administrators, not an isolation boundary (`docs/specs/remote-gui.md:99`). auth-refresh keeps its configuration in `~/.config/auth-refresh/` and its runtime state, including lane browser profiles, in `~/.local/share/auth-refresh/` [S1].

## Scope

In scope:

- `start --profile <name>` for browser sessions on both transports, binding a new profile to the session's owner.
- A profile store under remote-gui's state, separate from session directories.
- Single-writer locking taken before the session starts, with crash recovery by process identity, including Chromium's own singleton files.
- A graceful Chromium close on stop and expiry, and a clean-exit mark before each first launch, for sessions with a reusable profile.
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

### Owner decisions

The owner settled these on 2026-11-09:

- Opt in per session with a named profile; without it, behavior is unchanged.
- File permissions are the only at-rest protection, stated in the README; no keyring.
- A human-mode default start, with a per-session `--agent-start-approved` flag the skill passes only on the owner's instruction.
- No restore of the previous session's tabs or session-only cookies.
- auth-refresh and remote-gui are complementary: no retention expiry, because providers expire their own sessions, and no path checks against auth-refresh.
- Lock before the session record is created, and recover stale Chromium locks automatically once no browser on this host uses the profile, including locks that name another hostname.
- Require an explicit profile home when the sessions root is overridden.
- Refuse a profile last opened by a newer Chromium major version.
- One owner and transport kind per profile.
- Apply the R-2 proposals for deletion safety, the holder report, extra criteria and when the agent may use a profile, and fit the graceful close inside the existing stop deadlines.
- Apply the R-3 proposals as written: a bounded close with an immediate kill, holder cleanup by the guard, a recovery hint for a running browser, and the wording and test fixes.
- Apply the R-4 proposals as written: detect a running browser by connecting to Chromium's singleton socket, state that only persistent sign-ins survive, tell the owner to repeat `cleanup` until the session stops, and run the browser check before the session record exists.
- Apply the R-5 proposals as written: terminate Chromium before killing it on stop, release the lock before recording `stopped`, forbid agents from reading profile files, refuse a misplaced `--agent-start-approved`, and cover these defaults in the owner summary.

### Commands

- `start --profile <name>` opens or creates the named profile. Names must match `^[a-z0-9][a-z0-9-]{0,39}$`; any other name fails with `invalid-profile-name` before any file is touched. For Tailscale, the CLI resolves the owner through the same LocalAPI check the supervisor uses, before it locks the profile. A new profile is bound to that owner login, or to the transport kind `loopback` with an empty owner login. Opening a profile whose recorded owner or transport kind differs fails with `profile-owner-mismatch` before the session record is created. For a profile session the supervisor resolves the owner before it starts the browser, and refuses to launch Chromium unless its resolved owner equals the profile owner.
- `profile list` prints secret-free JSON with each profile's name, owner login, transport kind, created and last-used times, and `in_use` with the holding session ID. It reads `in_use` from `meta.json` and the liveness of the recorded guard identity, and never takes the lock, so it cannot cause a start to fail.
- `profile delete <name>` takes the profile lock and runs the same Chromium singleton check as `start`, then removes the profile directory. It fails with `profile-in-use` while a session holds the lock, and with `profile-browser-still-running` while a Chromium on this host still uses the profile. Repeated deletes return `missing` and exit 0, matching `stop`.
- `status` and `access` report `profile: <name>` for a session with a profile. Without `--profile`, output is unchanged.

### Storage

Profiles live at `$XDG_STATE_HOME/remote-gui/profiles/<name>/`, or `~/.local/state/remote-gui/profiles/<name>/`, beside the default sessions root. `REMOTE_GUI_PROFILE_HOME` or `--profile-home` overrides the profile root. When `REMOTE_GUI_HOME` or `--home` overrides the sessions root, `start --profile`, `profile list` and `profile delete` fail with `profile-home-required` unless a profile root override is also given. The default root is outside auth-refresh's default directories [S1]; remote-gui does not check override paths against them.

Each profile has:

- `meta.json` (0600): name, owner login, transport kind, created and last-used times, the Chromium major version that last opened it, and while in use the holder's session ID and guard identity.
- `chromium/` (0700): the Chromium user data directory.
- `.lock` (0600): the single-writer lock file.

The store root, each profile directory, `meta.json`, `.lock` and `chromium/` are 0700 directories or 0600 files, checked with the existing `private` helper and opened without following symlinks. Paths Chromium creates inside `chromium/`, including its singleton symlinks, are Chromium's own.

Before each Chromium launch, remote-gui merges its controlled keys into the existing `chromium/Default/Preferences` instead of replacing the file: password manager and credential service off, downloads to this session's `downloads` directory, the startup setting for that launch, and before a session's first launch `profile.exit_type` set to `Normal` (see Lifecycle). Every other preference Chromium saved is kept. Downloads stay per session and are deleted on stop.

Chromium keeps the `--password-store=basic` argument. The design relies on no keyring: it treats profile files as readable by anyone with the runtime's OS account or root, and the README says so. Reusable profiles therefore work on headless hosts.

### Single writer

The CLI takes an exclusive `flock` on the profile's `.lock` before it creates the session record, then confirms the locked file is still the `.lock` at the profile path, by device and inode, and retries once if a concurrent delete replaced it. A held lock fails at once with `profile-in-use`, and nothing is created or started. The report names the holder's session ID from `meta.json` only while that holder's recorded guard identity is alive, and otherwise reports `holder: starting`. The winner writes its session ID into `meta.json` right after creating its record, and its guard identity once the guard starts. The CLI passes the locked descriptor to the guard through `ExtraFiles`, the way the guard already passes its reserved listener to its supervisor, and the guard holds it for the session's whole life, across the browser start retries. When the session ends, the guard clears the holder from `meta.json` and updates `last used` before it releases the lock, so this bookkeeping does not depend on the supervisor finishing. It releases the lock before it records the session as `stopped`, so a start issued right after `stop` returns finds the profile free.

After taking the lock, the CLI checks `meta.json`. A holder recorded there whose guard identity is no longer alive is cleared and the recovery is noted in the new session's record. Still before creating the session record, the CLI checks Chromium's singleton files, as `profile delete` does. If `SingletonLock` exists, the CLI connects to the Unix socket that `SingletonSocket` points to. A successful connection means a live Chromium is using the profile, however its directory was spelled, and the start fails with `profile-browser-still-running`, leaving no record or process. A missing target or a refused connection, which also covers a lock from another hostname or another PID namespace, means the files are stale: the CLI removes `SingletonLock`, `SingletonSocket` and `SingletonCookie` and continues. The CLI never connects to anything outside the socket path the symlink names. The diagnostic names the session whose record owns that browser process when there is one, and says to run `cleanup` until that session reports `stopped`, since one `cleanup` pass can end before the browser has exited; `cleanup` stops an orphaned remote-gui browser through its record; for a browser the owner started by hand, it says to close that browser.

### Lifecycle

- First launch in a session: remote-gui sets the startup setting to open the New Tab page instead of the last session, sets `profile.exit_type` to `Normal` so Chromium does not treat an earlier crash or SIGKILL as a reason to restore session cookies, and starts Chromium without `--restore-last-session`, with the marker URL as its only page. Persistent cookies and site storage carry over. The previous session's tabs and session-only cookies do not, whether that session ended cleanly or not. A provider that keeps its sign-in only in a session cookie therefore asks for a new sign-in each session unless the owner chose its "stay signed in" option.
- In-session handoff: before each relaunch, remote-gui sets the startup setting back to last-session restore (`restore_on_startup` 1) and keeps `--restore-last-session`, so handoffs keep tabs, session cookies and tab storage as today.
- Stop and expiry with a reusable profile: the supervisor's browser stop first tries the existing owned x11vnc Exit path, bounded to two seconds in total including the connection. If Chromium is still running, it sends SIGTERM to Chromium alone and waits up to one second, which lets Chromium save cookies set just before the stop, then sends SIGKILL if it is still running, and stops the remaining children as today, with the X server after Chromium. This stays inside the guard's five-second supervisor deadline on expiry, and the guard and `stop` deadlines stay unchanged. If the supervisor is killed first, the guard's group stop ends Chromium as today. Either way the next start's singleton check recovers its lock and its clean-exit mark keeps session cookies from returning. Once the owned processes are gone, the guard clears the holder, updates `last used` and closes the lock descriptor, and only then records `stopped`. The profile is kept, and `downloads`, `Xauthority`, `vnc.passwd` and `control.sock` are deleted. The session record stays, so `status`, repeated `stop` and `cleanup` behave as today.
- Before launching, remote-gui reads the installed Chromium's major version with `--version`. A profile last opened by a newer major version is refused with `profile-chromium-newer`, so Chromium never downgrades its data. The owner upgrades Chromium or deletes the profile.
- There is no retention timer. `profile delete` is the only way a profile is removed.

### Sign-in and hand-back

A session with `--profile` starts in human mode when no mode is given, whether it creates the profile or reuses it. `start --profile <name> --browser-mode agent` fails with `profile-requires-human-start` unless `--agent-start-approved` is also given. The flag applies to that one session and is recorded as `agent_start_approved: true` on its session record; it is never stored on the profile. Given without `--profile` and `--browser-mode agent`, or on any other command, it is refused like other misplaced options.

The skill passes `--profile <name>` only for a profile the owner named in the current task or in persistent instructions, and never creates or picks a profile on its own. It passes `--agent-start-approved` only when the owner has explicitly approved agent use of that named profile in the current task. Otherwise it starts in human mode and hands off to the agent only after the owner confirms, as it does today. In either case, a sign-in, MFA or other credential challenge in agent mode requires `handoff <id> --browser-mode human` before any entry, and the agent never enters credentials. When it opens a profile in human mode, the skill reminds the owner to choose the provider's "stay signed in" option. The skill states that a reused profile may already be signed in, that the agent must verify the provider page before acting, and that reuse grants no new provider permission. The skill's lock rule changes to say that remote-gui itself recovers stale Chromium locks in reusable profiles, and that agents still never delete lock files or force a launch by hand. Agents never list, read or copy files under the profile store; they reach a profile only through a remote-gui session.

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
| Approved agent start | A session with `--profile` started in agent mode with `--agent-start-approved` on the owner's explicit instruction. |

## Acceptance Criteria

- [ ] AC-01: Without `--profile`, browser sessions still start with a fresh profile that is deleted on stop and expiry, with unchanged command output and records.
- [ ] AC-02: A persistent cookie set in one `--profile` session is present in a later session on the same profile after the first session stopped. The first session's `downloads`, `Xauthority`, `vnc.passwd` and `control.sock` are gone and its stopped record remains.
- [ ] AC-03: A later session on a reused profile opens with only the connection page: tabs and session-only cookies from the previous session are absent after a clean stop, an expiry and a SIGKILL of the previous session, while handoffs within a session still keep tabs, session cookies and tab storage.
- [ ] AC-04: A second session cannot start on a profile while another live session holds it, gets `profile-in-use` naming the holder's session ID or `holder: starting`, and leaves no record or process behind, and `profile list` never causes a start to fail.
- [ ] AC-05: After the supervisor and Chromium of a profile session are killed with SIGKILL, or when the leftover lock names another hostname, a new session on the same profile starts and works, while a profile whose Chromium is still running is refused with `profile-browser-still-running`, however that browser spelled the profile directory, leaving no record or process and naming the owning session and a recovery that works.
- [ ] AC-06: A session whose resolved owner differs from the profile owner, or of a different transport kind, cannot open the profile, no record or process is created, and Chromium never launches on a profile whose owner the supervisor has not matched.
- [ ] AC-07: Invalid profile names are refused before any file is touched, and a profile last opened by a newer Chromium major version is refused before launch.
- [ ] AC-08: The profile store's own paths are private to the runtime's OS account and not followed through symlinks, and the README states that a reusable profile is protected only by file permissions and the host account boundary.
- [ ] AC-09: A download in a later session lands in that session's own download directory, and preferences Chromium saved in the profile survive across sessions.
- [ ] AC-10: `profile list` shows each profile with its owner, transport kind, times and holder, `profile delete` removes an idle profile completely and refuses one held by a session or used by a running Chromium, and `status` and `access` name a session's profile.
- [ ] AC-11: Credential entry on a reusable profile happens only in human mode. A session with `--profile` starts in human mode unless `--agent-start-approved` is given, the skill gives the agent control only after a confirmed handoff or on the owner's explicit approval in the current task, and the agent opens only a profile the owner named and never reads profile files directly.
- [ ] AC-12: auth-refresh files stay unread and unchanged by every profile command, and the default profile store lies outside auth-refresh's default directories.
- [ ] AC-13: The README and skill describe reusable profiles with the glossary terms, the opt-in flag, owner binding, locking, deletion, the at-rest protection, the provider expiry limitation, that only persistent sign-ins survive and the "stay signed in" advice, the recovery for `profile-browser-still-running`, the rule that agents never read profile files, and auth-refresh as the first route for sign-in.
- [ ] AC-14: The module's race tests, vet, pinned lint and tidy checks pass, and service shares, browser phases, owner access and `cleanup` keep their behavior for sessions without a profile.
- [ ] AC-15: With an overridden sessions root, `--profile` and the `profile` commands fail with `profile-home-required` unless a profile root override is given, and with one they use that root.
- [ ] AC-16: A reusable profile session stopped by `stop` or by expiry closes Chromium gracefully or, when Chromium does not exit within two seconds, terminates it and then kills it within the supervisor deadline, keeping cookies set just before the stop whenever Chromium honours the terminate; `stop` reports `stopped` only after the holder is cleared and the lock released, and the next session sees a clean previous exit.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Run the existing real headed-browser and lifecycle tests without `--profile`; add CLI output and record snapshot tests for `start`, `status`, `access` and `stop` without the flag. |
| AC-02 | Real browser test (`REMOTE_GUI_BROWSER_E2E=1`): a local fixture sets a persistent cookie in session one on profile `t-reuse`; stop; assert the named private files are absent and the stopped record remains; start session two on `t-reuse` and assert the fixture sees the cookie. |
| AC-03 | Real browser test, run three times with session one ended by `stop`, by a short expiry and by SIGKILL of its supervisor, guard and Chromium: in session one open an extra fixture tab and set a session-only cookie; hand off human to agent and back, and assert both survive; end session one; start session two and assert through CDP after a handoff to agent that only the connection page is open and the fixture sees no session-only cookie. |
| AC-04 | Unit and CLI tests: two concurrent `start --profile` calls produce one success and one `profile-in-use` naming the first session's ID or `holder: starting`; the loser leaves no session directory, record or child process; the lock stays held across an injected browser start retry; `profile list` run in a loop during concurrent starts never makes one fail; a race on a profile whose `meta.json` names a finished session reports `holder: starting`, never that session. |
| AC-05 | Real browser test: start a profile session, SIGKILL its supervisor, guard and Chromium, then start a new session on the profile and assert ready status and a working viewer. Unit tests for the singleton check: a lock whose socket target is missing, one whose socket refuses connections, and a lock naming another hostname each remove the three files and continue; a listening socket gives `profile-browser-still-running`, removes nothing and creates no session record. Real browser tests: a live Chromium started on the profile with its directory spelled through a relative path and through a symlink is refused; kill a profile session's guard and supervisor only, assert the diagnostic names that session, run `cleanup` until it reports `stopped`, then start successfully. |
| AC-06 | Unit tests with injected owner logins and transports: owner mismatch and transport mismatch fail with `profile-owner-mismatch` and create no record or child process. CLI test against a fake LocalAPI with no `--owner-login`: the resolved owner is compared before the lock. Supervisor test: a LocalAPI that resolves a different owner than the CLI saw stops the session before Chromium launches. |
| AC-07 | Unit tests: names with `..`, `/`, uppercase, a leading hyphen and 41 characters are refused and the store is unchanged; a `meta.json` recording a newer Chromium major version gives `profile-chromium-newer` before any launch. |
| AC-08 | Unit tests: assert modes on the store root, profile directory, `meta.json`, `.lock` and `chromium/`; replace each with a symlink and assert refusal. Review the README wording against the Storage design. |
| AC-09 | Real browser test: download a fixture file in session two and assert it lands in session two's `downloads`; set an unrelated preference value in session one's `Preferences` and assert it is still present after session two's launch. |
| AC-10 | CLI tests: `profile list` output fields for idle and in-use profiles; delete idle, delete in use, delete while a Chromium still uses the profile after its guard was killed, repeated delete; a start whose `.lock` was replaced by a concurrent delete retries on the new file; `status` and `access` include `profile`. |
| AC-11 | Unit tests: `--profile` without a mode starts human; `--profile --browser-mode agent` without `--agent-start-approved` fails with `profile-requires-human-start`; with the flag it starts agent mode and the record holds `agent_start_approved`; the flag without `--profile`, without `--browser-mode agent`, and on `share`, `status` and `profile list` is refused. Native routing fixtures in `tests/remote-gui/native-routing.e2e.test.ts`, which set a profile home: the agent uses `--profile` only for a profile the owner named; without owner approval the agent starts human and hands off only after confirmation; with approval it passes the flag; an agent-mode credential challenge triggers a handoff to human before any entry. |
| AC-12 | Place sentinel files in temporary `~/.config/auth-refresh` and `~/.local/share/auth-refresh` trees with recorded hashes, setting each sentinel's access time earlier than its modification time so that any read under `relatime` updates it; run the AC-02, AC-04 and AC-10 scenarios; assert the sentinels are unchanged and the default store path is outside both trees. |
| AC-13 | Review the README and skill diff against the glossary and design; run `tests/remote-gui/package.test.ts` and `bun test tests/vh-adlc`. |
| AC-14 | Run `go test -race ./...`, `go vet ./...`, golangci-lint v2.15.0 `config verify` and `run`, and `go mod tidy -diff` in `plugins/remote-gui`, plus the existing `tests/remote-gui` fixtures. |
| AC-15 | CLI tests with `REMOTE_GUI_HOME` and with `--home`: `start --profile`, `profile list` and `profile delete` fail with `profile-home-required`; with `REMOTE_GUI_PROFILE_HOME` and with `--profile-home` they use that root. |
| AC-16 | Real browser test with the Exit path blocked by an open dialog: the page sets a persistent cookie just before `stop`, and the next session sees it. Start a new session on the profile immediately after `stop` returns `stopped` and assert it succeeds. Real browser test: stop a profile session and let another expire; assert `stop` reports `stopped`, the profile's `Preferences` show a clean exit, and Chromium's singleton files are gone. Unit tests with a Chromium stand-in that ignores the Exit request, once through `stop` and once through expiry: SIGTERM after two seconds and SIGKILL one second later for a stand-in that also ignores SIGTERM, the supervisor finishes before the guard's deadline, `stop` reports within its wait, the guard clears the holder, and the next first launch sets `profile.exit_type` to `Normal`. |

## Tasks

- [x] T1 `plugins/remote-gui/internal/config/config_test.go` - parser tests that fail on the current code: `start --profile` accepts only names matching `^[a-z0-9][a-z0-9-]{0,39}$` and refuses `..`, `/`, uppercase, a leading hyphen and 41 characters with `invalid-profile-name`; `--profile-home` and `REMOTE_GUI_PROFILE_HOME` set the profile root; `profile list` and `profile delete <name>` parse; with `REMOTE_GUI_HOME` or `--home` and no profile root, `start --profile`, `profile list` and `profile delete` fail with `profile-home-required`; `--agent-start-approved` without `--profile` and `--browser-mode agent`, or on `share`, `status` and `profile list`, is refused like other misplaced options (AC-07, AC-11, AC-15)
      Evidence: 2026-11-10, `go test ./internal/config/` in plugins/remote-gui, fails to build with `c.Profile undefined (type Config has no field or method Profile)` and the matching ProfileHome and ProfileAction errors, so every new case fails because the parser has no profile support yet; the module checks are expected to fail until T2 lands.
- [x] T2 `plugins/remote-gui/internal/config/config.go`, `plugins/remote-gui/cmd/remote-gui/main.go` - the new flags, the `profile` command and the profile root defaults; T1 passes and the existing config and CLI tests still pass (AC-15)
      Evidence: 2026-11-10, `go test ./internal/config/` failed to build before the change (T1), then passed; `go test -race ./...`, `go vet ./...`, golangci-lint v2.15.0 `config verify` and `run` (0 issues) and `go mod tidy -diff` passed with the REMOTE_GUI_* tool paths unset. With them set from runtime.env, the existing `TestServiceDoctorDoesNotNeedGUI` fails because it expects missing GUI tools, which is host configuration. main.go is unchanged here; the `profile` command is wired in T6.
- [x] T3 `plugins/remote-gui/internal/profile/profile_test.go` - store tests that fail because the package does not exist: modes on the store root, profile directory, `meta.json`, `.lock` and `chromium/`, and refusal when any of them is a symlink; `meta.json` fields; the lock is exclusive, the locked inode is rechecked against the path and retried once after a replacement; a recorded holder is reported only while its guard identity is alive, otherwise `holder: starting`; the singleton check removes the three files for a missing socket target, a refusing socket and a lock naming another hostname, and refuses a listening socket with `profile-browser-still-running` without removing anything; the Preferences merge keeps unrelated keys, sets the controlled keys, writes `profile.exit_type` `Normal` and the startup setting for a first launch or a handoff; a recorded newer Chromium major version gives `profile-chromium-newer` (AC-04, AC-05, AC-07, AC-08, AC-09)
      Evidence: 2026-11-10, `go test ./internal/profile/` in plugins/remote-gui fails to build with `undefined: Acquire`, `undefined: Meta` and `undefined: ReadMeta`, because the package does not exist yet; T4 makes it pass.
- [ ] T4 `plugins/remote-gui/internal/profile/` - the profile store, lock, holder bookkeeping, singleton check, Preferences merge and version check; T3 passes and `go test -race ./...` passes (AC-04, AC-05, AC-07, AC-08)
- [ ] T5 `plugins/remote-gui/internal/session/profile_test.go`, `plugins/remote-gui/cmd/remote-gui/main_test.go` - session and CLI tests that fail on the current code: without `--profile`, `start`, `status`, `access` and `stop` output and records are unchanged; against a fake LocalAPI with no `--owner-login`, the owner is resolved and compared before the lock; owner and transport mismatches fail with `profile-owner-mismatch` and leave no record or process; two concurrent starts give one success and one `profile-in-use` with no record or process for the loser, also when `meta.json` names a finished session; the lock passes to the guard through `ExtraFiles` and stays held across an injected start retry; the guard clears the holder, updates `last used` and releases the lock before it records `stopped`; a supervisor whose LocalAPI resolves a different owner stops before Chromium launches; `--profile` without a mode starts human, agent mode without `--agent-start-approved` fails with `profile-requires-human-start`, and with it the record holds `agent_start_approved`; `profile list`, `profile delete` and the `profile` field in `status` and `access` behave as designed (AC-01, AC-04, AC-06, AC-10, AC-11, AC-16)
- [ ] T6 `plugins/remote-gui/internal/session/session.go`, `plugins/remote-gui/internal/session/daemon.go`, `plugins/remote-gui/cmd/remote-gui/main.go` - the profile start path, guard lock handoff and bookkeeping, supervisor owner recheck and the `profile` commands; T5 passes and `go test -race ./...` passes (AC-01, AC-04, AC-06, AC-10, AC-11)
- [ ] T7 `plugins/remote-gui/internal/browser/lifecycle_test.go`, `plugins/remote-gui/internal/browser/browser_test.go` - ungated tests that fail on the current code: a profile session's first launch omits `--restore-last-session` and uses the profile's `chromium/` directory and the session's own downloads; a handoff relaunch restores the last session; with a Chromium stand-in that ignores Exit, stop and expiry send SIGTERM after two seconds and SIGKILL one second later to a stand-in that also ignores SIGTERM, finishing inside the guard's deadline; a session without a profile still gets a fresh disposable profile (AC-01, AC-03, AC-09, AC-16)
- [ ] T8 `plugins/remote-gui/internal/browser/browser.go`, `plugins/remote-gui/internal/browser/phase.go` - the reusable-profile launch, the startup-setting switch and the bounded close; T7 passes and `go test -race ./...` passes (AC-03, AC-16)
- [ ] T9 `plugins/remote-gui/internal/browser/browser_test.go` - real-browser tests under `REMOTE_GUI_BROWSER_E2E=1`: a persistent cookie survives into a later session while the first session's private files are gone and its stopped record remains; tabs and session-only cookies are absent after a `stop`, a short expiry and a SIGKILL, while in-session handoffs keep them; after a SIGKILL of the supervisor, guard and Chromium a new session works; a live Chromium on the profile spelled through a relative path and through a symlink is refused; killing only the guard and supervisor gives a diagnostic naming the session, and `cleanup` until `stopped` lets a start succeed; a later download lands in its own session directory and an unrelated preference survives; with Exit blocked by an open dialog a cookie set just before `stop` survives; a start right after `stop` returns `stopped` succeeds; all pass (AC-02, AC-03, AC-05, AC-09, AC-16)
- [ ] T10 `tests/remote-gui/native-routing.e2e.test.ts`, `tests/remote-gui/fixtures/native-routing.ts` - routing fixtures that set a profile home: the agent uses `--profile` only for a profile the owner named; without approval it starts human and hands off only after confirmation; with approval it passes `--agent-start-approved`; an agent-mode credential challenge leads to a handoff to human before any entry; the agent reminds the owner about "stay signed in" and never reads profile files; all pass (AC-11)
- [ ] T11 `tests/remote-gui/profile.e2e.test.ts` - CLI scenarios with sentinel files in temporary `~/.config/auth-refresh` and `~/.local/share/auth-refresh` trees, each with its access time set earlier than its modification time: create, reuse, race, list and delete profiles, then assert the sentinel hashes and access times are unchanged and the default store lies outside both trees; passes (AC-12)
- [ ] T12 `plugins/remote-gui/README.md`, `plugins/remote-gui/skills/remote-gui/SKILL.md` - reusable profiles with the glossary terms, the opt-in flag, owner binding, locking, deletion, file-permission protection, provider expiry, persistent sign-ins only with the "stay signed in" advice, the `cleanup` recovery, the rule that agents never read profile files, the changed lock rule, and auth-refresh as the first route for sign-in; `bun test tests/remote-gui/package.test.ts` and `bun test tests/vh-adlc` pass (AC-13)
- [ ] T13 `plugins/remote-gui/` - the full check set: `go test -race ./...`, `go vet ./...`, golangci-lint v2.15.0 `config verify` and `run`, `go mod tidy -diff`, the existing headed-browser and lifecycle tests without `--profile`, and the existing `tests/remote-gui` fixtures; all pass, with any regression fixed in this commit (AC-01, AC-14)

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-09 | R-1 | spec | `8ff685a1883330fd0d50536c79788eae4cc0399f` | claude-opus-5-5 | procedural | Blocking startup-restore and stale Chromium lock gaps plus ten should-fix and nit findings. |
| 2026-11-09 | R-2 | spec | `4891dcc7d97e9c725fbef93c83a7413f59321aa8` | claude-opus-5-5 | procedural | Blocking crash-restored session cookies plus eight should-fix and one nit finding. |
| 2026-11-09 | R-3 | spec | `a5ef9e6204cad85777293bb5ec33b505f6311be4` | claude-opus-5-5 | procedural | No blocking findings; three should-fix findings and five nits. |
| 2026-11-09 | R-4 | spec | `05b51e9093dacbb1bc2df87bb88772e9555c1986` | claude-opus-5-5 | procedural | No blocking findings; two should-fix findings and two nits. |
| 2026-11-10 | R-5 | spec | `c071bd4682d176391849c39b9eb873bdce972510` | claude-opus-5-5 | procedural | No blocking findings; three should-fix findings and two nits. |
| 2026-11-10 | R-6 | spec | `f7e3793255d966b726ecc76dc9a59d0b92b8b65b` | claude-opus-5-5 | procedural | No blocking findings; one should-fix finding and four nits, left in the record at the owner's direction. |
| 2026-11-10 | R-6 | spec | `f7e3793255d966b726ecc76dc9a59d0b92b8b65b` | n/a | n/a | accepted by owner |

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

### R-3

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design (Lifecycle), Design (Owner decisions), AC-16, Test Plan
EVIDENCE: Line 122 says the graceful close "waits up to three seconds, then stops the remaining children as today. That fits inside the guard's five-second supervisor deadline". On expiry the guard SIGTERMs the supervisor and SIGKILLs it after 5 seconds (plugins/remote-gui/internal/session/daemon.go:312-319). Before the deferred `bundle.Stop()` (daemon.go:422) runs, the later-registered deferred `removeForward` runs (daemon.go:473-483), and it can wait up to 6 seconds for the state lock (daemon.go:123-125). The Exit path itself allows a 1 second dial and a 3 second handshake deadline (plugins/remote-gui/internal/browser/quit.go:29-37). If Chromium ignores Exit, "stops the remaining children as today" adds another 3 second SIGTERM wait before SIGKILL (browser.go:227-244). So 3 s + 3 s is already past the 5 s deadline. The guard then SIGKILLs the supervisor and `stopMembers` kills Chromium (daemon.go:88-118), and anything the supervisor was going to do after the close, such as updating `last used`, does not happen. On an explicit `stop` the guard has no deadline (daemon.go:295-303), so the AC-16 stand-in test, which covers only `stop`, cannot catch this. The choice to fit the close inside the existing deadlines instead of extending them is also missing from the owner decisions: line 87 applies the R-2 proposals only for deletion safety, the holder report, extra criteria and agent use, and not R-2 F-02.
PROPOSAL: Bound the whole close inside the expiry deadline, for example by sending SIGKILL to Chromium straight after the graceful wait, or state that a slow close on expiry ends in the guard's SIGKILL and name the component that then updates `last used`. Add an expiry variant to the AC-16 stand-in test, and record the owner's choice or raise it as an open question.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Single writer, Lifecycle), AC-04, Test Plan
EVIDENCE: Line 114: the `profile-in-use` report "names the holder's session ID from `meta.json`, or `holder: starting` while the winning session has not yet written it". Line 116 clears a dead holder only after the next winner has taken the lock. Line 122 says only that `last used` is updated at the end, and nothing clears the holder when a session ends. When two starts race on a profile that has been used before, `meta.json` still names the previous, finished session until the winner overwrites it, so the loser reports a dead session as the holder. Line 92 gives `profile list` a guard-liveness check, but the design gives none for the loser's report. The AC-04 row (line 176) uses only a fresh race, so it passes either way.
PROPOSAL: Clear the holder in `meta.json` at session end, before the lock is released, and have the loser name a recorded holder only when its guard identity is alive, otherwise `holder: starting`. Add a race test on a profile whose `meta.json` holds a stale holder.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Single writer, Commands), AC-05, AC-13
EVIDENCE: Line 116: a live Chromium on this host using the profile "stops the start, with `profile-browser-still-running`, and the owner stops that browser". Line 93 has `profile delete` refuse in the same state, so the profile can be neither used nor deleted. The design does not say how the owner stops that browser. The skill forbids "kill by executable name" (plugins/remote-gui/skills/remote-gui/SKILL.md:61) and forcing a launch (SKILL.md:53). Chromium outlives its controllers only after the guard and supervisor are both gone (Background line 44). Its identity is in that session's `Owned` list (browser.go:161-163), `status` reports such a record as `cleanup-pending` with "run cleanup" (session.go:96-101), and `cleanup` SIGTERMs the `Owned` processes of a dead-controller record (daemon.go:164-181, :671). That is a working recovery, but neither the diagnostic, AC-05 nor the AC-13 README and skill list mentions it.
PROPOSAL: Have `profile-browser-still-running` name the session whose record owns that browser process when there is one, and name its recovery (`cleanup` for an orphaned remote-gui browser, or closing a browser the owner started). Add that recovery to the README and skill items in AC-13 and to the AC-05 tests.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Design (Single writer)
EVIDENCE: Line 114: "The CLI passes the locked descriptor to the guard, the way the guard already receives its reserved listener". The guard reserves the listener itself (daemon.go:248) and passes it to its supervisor through `ExtraFiles` (daemon.go:273-274). Background line 42 describes this correctly. Nothing in the code passes a descriptor into the guard today.
PROPOSAL: Reword to "the way the guard already passes its reserved listener to its supervisor through ExtraFiles".

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Design (Storage), AC-15
EVIDENCE: Line 98: "When `REMOTE_GUI_HOME` or `--home` overrides the sessions root, `--profile` fails with `profile-home-required`". AC-15 (line 166) and its proof (line 187) also require `profile list` and `profile delete` to fail with `profile-home-required`. The Design never states that requirement for those two commands.
PROPOSAL: Extend the Storage sentence to cover the `profile` commands, so that AC-15 matches the Design.

FINDING: F-06
KIND: judgement
SEVERITY: nit
WHERE: Design (Sign-in and hand-back, Glossary), AC-11, AC-13
EVIDENCE: The glossary defines "Reusable profile" (line 144), but line 128 and AC-11 (line 162) use "a session on a reused profile" and "A reused-profile session". This leaves open whether the first session, the one that creates the profile, starts in human mode. The AC-11 proof (line 183) says every `--profile` start without a mode is human, and AC-13 holds the README and skill to the glossary terms.
PROPOSAL: Say "a session with `--profile`" in Design and AC-11, or add "reused profile" to the glossary with that meaning.

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: Context (Background), Sources
EVIDENCE: The design's fix for crash-restored session cookies rests on a Sources entry (line 366) that says "This document did not read them directly". The standard requires a cited `file:line` or a command and its output, gathered when the claim was written. I ran the measurement in this review with the host's Chromium 151.0.7922.137 (`--headless=new`, scratch profile, local cookie fixture). While the browser runs and after a SIGKILL, `profile.exit_type` is `Crashed`. Relaunching that copy unchanged sent `sess=1; pers=1`. A copy with `exit_type` set to `Normal` and `restore_on_startup` set to 5 sent only `pers=1`, and a later relaunch with `restore_on_startup` 1 and `--restore-last-session` still sent only `pers=1`. A fresh profile first launched with `restore_on_startup` 5, closed with CDP `Browser.close`, then relaunched with 1 and `--restore-last-session` kept `sess=1`. The mechanism holds, but the document does not record that evidence.
PROPOSAL: Replace the second-hand source with a measurement of this kind in Background, giving the command and the observed output, as line 33 does for the lock format.

FINDING: F-08
KIND: judgement
SEVERITY: nit
WHERE: Test Plan (AC-12)
EVIDENCE: The AC-12 row proves "unread" with "recorded hashes and access times". `findmnt -no OPTIONS /home` shows `relatime`, and `/tmp` is a tmpfs, which also defaults to relatime. Under relatime a read updates atime only when the old atime is not later than mtime, and a newly written sentinel's atime is never earlier than its mtime, so the access-time check can pass even after a read.
PROPOSAL: Set each sentinel's atime earlier than its mtime before the run so that any read updates it, or watch the trees for access events during the scenarios.

### R-4

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Single writer), AC-05, Test Plan (AC-05)
EVIDENCE: Line 117 removes `SingletonLock`, `SingletonSocket` and `SingletonCookie` and continues "when the PID is alive but its command line does not name this profile's `chromium/` directory". That rule fails open. Removal is the default whenever the string match misses, so a missed match lets a second Chromium open a profile that a live browser is still writing. I started Chromium 151.0.7922.137 on a scratch profile. `readlink SingletonLock` gave `fedora-43-23356`, and `/proc/23356/cmdline` held `--user-data-dir=<path>` exactly as the caller spelled it. A browser the owner starts by hand, which line 117 names as a case, can spell the same directory relative to its working directory or through a symlinked home, and the match then misses. A Chromium in another PID namespace on this host records a PID that is meaningless here. The repository's own fixtures run under `bwrap --unshare-pid` (tests/remote-gui/native-routing.e2e.test.ts:47). The AC-05 unit cases cover only a dead PID, an unrelated live PID and a foreign hostname, so every box can be ticked while a differently spelled live browser loses its lock.
PROPOSAL: Decide liveness with a check that does not depend on spelling. For example, try to connect to the `SingletonSocket` target, or compare paths resolved against `/proc/<pid>/cwd` and symlinks, and refuse when either finds the profile in use. Add an AC-05 unit case for a live browser whose `--user-data-dir` is spelled differently from remote-gui's path.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Context (Owner summary), Design (Lifecycle), AC-02, AC-13
EVIDENCE: The goal (line 5) says "provider sessions survive the end of a remote-gui session". Lifecycle line 121 and the owner summary (line 27) drop session-only cookies at every first launch, and only persistent cookies carry over. Many providers keep a sign-in in a session-only cookie unless the user chooses an option such as "stay signed in". For those providers the sign-in does not survive, and nothing in the document says so: searching it for "stay signed", "remember" or "keep me" finds nothing relevant. AC-02 proves reuse only with a fixture cookie that is persistent. The AC-13 README and skill list names "the provider expiry limitation" but not this one. So every criterion can be met while the owner keeps signing in again for those providers, and that is the problem the feature exists to fix.
PROPOSAL: State in the owner summary, the Lifecycle and the AC-13 README and skill items that only persistent sign-ins survive, and that the owner should choose the provider's stay-signed-in option. Have the skill tell the owner this when it opens a profile in human mode.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Design (Single writer), AC-05, Test Plan (AC-05)
EVIDENCE: Line 117 says the `profile-browser-still-running` diagnostic tells the owner to run `cleanup`, which "stops an orphaned remote-gui browser through its record". For a record whose controllers are dead, `cleanup` calls `finish(home, id, false)` (plugins/remote-gui/internal/session/daemon.go:671). That function sends SIGTERM to each owned process in spawn order (display, vnc, viewer-bridge, browser), waits 30 ms, and returns `owned-process-cleanup-pending` at the first one still alive (daemon.go:164-181). When I sent SIGTERM to an idle headless Chromium 151, it exited after 33 ms. One `cleanup` can therefore report `cleanup-pending` before it reaches the browser, or while the browser is still exiting. The AC-05 sequence "run `cleanup`, then start successfully" then depends on timing, and the record stays `cleanup-pending`.
PROPOSAL: Either say that the recovery is to repeat `cleanup` until the record reports `stopped`, or give `cleanup` a bounded wait for the owned browser of a profile session. Make the diagnostic, the README and skill text, and the AC-05 test agree.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Design (Single writer), AC-05
EVIDENCE: Line 117 places the Chromium singleton check "Before Chromium launches" but does not say which process runs it. `profile delete` runs it in the CLI (line 94). If `start` runs it in `browser.Start`, the check happens after the session record, the guard, the supervisor and Xvfb already exist (plugins/remote-gui/internal/session/session.go:150-170, plugins/remote-gui/internal/browser/browser.go:303-338). `browser.Start` retries a failed runtime three times (browser.go:284-301), and the error reaches the caller as `session-start-failed: ...` with a failed record (session.go:189-190). AC-04 and AC-06 say what a refusal leaves behind, but AC-05 does not.
PROPOSAL: Run the check in the CLI after the profile lock and before the session record is created, as `profile delete` does, and state in AC-05 that the refusal leaves no record or process. Otherwise, state the record outcome and that the check is not retried.

### R-5

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design (Lifecycle), Context (Owner summary), AC-02, AC-16, Test Plan
EVIDENCE: Lifecycle line 124 says that when the owned x11vnc Exit path does not close Chromium within two seconds, the stop "then sends SIGKILL to a Chromium that is still running". The owner summary (line 27) says without condition that "persistent cookies and site storage carry over". I ran Chromium 151.0.7922.137 (`--headless=new`, scratch profile) against a local fixture that sets `pers=1; Max-Age=86400`, and signalled the browser about 3 seconds after the page loaded. After SIGKILL, the relaunched profile sent no cookie to the fixture. After SIGTERM, it sent `pers=1`. SIGTERM also left `profile.exit_type` as `SessionEnded` and the three Singleton symlinks in place, so the next start's lock recovery and clean-exit mark would still apply. When Exit fails, for example because a dialog or a page has the keyboard, a sign-in finished shortly before stop or expiry is therefore lost. The usual case is an owner who signs in to set up a profile and then stops, which is the flow this feature exists for. The AC-02 and AC-16 real-browser rows exercise only a successful Exit, and the AC-16 stand-in checks only the SIGKILL timing, so every box can be ticked while this loss remains.
PROPOSAL: After a failed Exit, send SIGTERM to Chromium alone and wait briefly before the SIGKILL and before the X server is stopped, keeping the total inside the guard's five-second deadline, and update AC-16 to match. Add a real-browser test in which Exit is blocked: the page sets a persistent cookie just before stop, and the next session must still see that cookie.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Single writer, Lifecycle), AC-02, AC-16, Test Plan
EVIDENCE: Design line 116 says the guard clears the holder and updates `last used` "before it releases the lock". It does not order these steps against the record's `stopped` state. Today the guard's `finish` writes `r.State = "stopped"` as its final step (plugins/remote-gui/internal/session/daemon.go:198, called at :321 and :361). `Stop` returns as soon as the record reads `stopped` (plugins/remote-gui/internal/session/session.go:302-313). If the new bookkeeping and the lock release come after `finish`, a `start --profile` issued right after `stop` returns finds the lock still held. Line 116 makes that start fail "at once" with `profile-in-use`, and the report names the session that has just reported `stopped`, because its guard is still alive. The AC-02 proof ("stop; ... start session two") and AC-16 ("`stop` reports `stopped`, the holder is cleared") do not pin this order, so the test can be flaky and an agent that stops and restarts a profile session can be refused for no reason.
PROPOSAL: State that once the owned processes are gone, the guard clears the holder and closes the lock descriptor before it records `stopped`. Add a test that starts a new session on the profile immediately after `stop` returns `stopped`.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Sign-in and hand-back, Storage), AC-11, AC-13
EVIDENCE: Storage (line 112) treats profile files as "readable by anyone with the runtime's OS account or root", and Chromium keeps `--password-store=basic`, so the agent's own account can read the cookies of a reusable profile without starting a session. The goal (line 5) rests agent access to a signed-in profile on the owner's confirmation, and AC-11 limits the agent to opening "only a profile the owner named". Under this design those signed-in cookies stay on disk with no retention limit (line 126). Today they last at most one session of up to eight hours. The current skill forbids reading auth-refresh's "credential/profile/state files" and copying cookies (plugins/remote-gui/skills/remote-gui/SKILL.md:40). The Design's skill changes (line 132) and its auth-refresh section (line 136) add no matching rule for remote-gui's own profile store, and neither AC-11 nor AC-13 mentions one. An agent that reads or copies `chromium/` files bypasses the human-mode default, the approval flag and the owner-named rule.
PROPOSAL: Have the skill forbid agents from listing, reading or copying files under the profile store, and require them to reach a profile only through a remote-gui session. Add that rule to AC-11 and the AC-13 README and skill items.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Design (Sign-in and hand-back), AC-11, Test Plan (AC-11)
EVIDENCE: Line 130 defines `--agent-start-approved` only together with `start --profile <name> --browser-mode agent`. It does not say what happens when the flag is given without `--profile`, without `--browser-mode agent` (line 130 says such a start runs in human mode), or on another command. Compatibility (line 140) records `agent_start_approved` "when given". The parser rejects other misplaced options, for example `--owner-login` and `--reveal` (plugins/remote-gui/internal/config/config.go, `Parse`). The AC-11 proof covers only the agent-mode cases.
PROPOSAL: Say whether a misplaced `--agent-start-approved` is refused, as other misplaced options are, or ignored and left unrecorded. Add those cases to the AC-11 unit tests.

FINDING: F-05
KIND: judgement
SEVERITY: nit
WHERE: Context (Owner summary)
EVIDENCE: The owner summary (lines 19-29) leaves out several defaults and trade-offs that Design settles. With an overridden sessions root, `start --profile` and the `profile` commands fail with `profile-home-required` unless a profile root is also given (line 100). That affects any setup that sets `REMOTE_GUI_HOME`, including the existing fixtures (tests/remote-gui/native-routing.e2e.test.ts:49). A profile last opened by a newer Chromium major version is refused (line 125). Stop and expiry kill Chromium after a two-second close attempt (line 124). The standard asks the summary to cover important defaults and trade-offs.
PROPOSAL: Add one or two sentences to the owner summary covering the profile-home requirement, the newer-Chromium refusal and the bounded close on stop.

### R-6

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan (AC-16), AC-16
EVIDENCE: Test Plan line 191 has a real-browser case "with the Exit path blocked by an open dialog: the page sets a persistent cookie just before `stop`, and the next session sees it." The row does not check that Exit actually failed. A scripted JS alert is tab-modal and may not stop the Alt+F, X menu exit that quitBrowser sends (plugins/remote-gui/internal/browser/quit.go:44-63). A beforeunload prompt only appears after user activation. If the dialog does not block Exit, the case passes through a graceful close, and the SIGTERM path added for R-5 F-01 (Lifecycle line 125) gets no real-browser evidence. The unit stand-in row checks only signal timing. AC-16's clause "keeping cookies set just before the stop whenever Chromium honours the terminate" could then be marked met without any observation of a terminate.
PROPOSAL: Block Exit in a way that is known to work, for example by ending the owned x11vnc process so quitBrowser fails. Have the test assert that Chromium was still running after the Exit attempt and received SIGTERM, then check that the cookie is present in the next session.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Context (Owner summary), Design (Lifecycle)
EVIDENCE: Owner summary line 27 says the close happens "all within the five-second deadline" for stop and expiry. The five-second supervisor deadline exists only when the guard is signalled or the TTL fires (plugins/remote-gui/internal/session/daemon.go:304-319). An explicit `stop` goes through the control socket, the guard has no deadline on that path (daemon.go:295-303), and only the ten-second `stop` wait applies (plugins/remote-gui/internal/session/session.go:302-313). Lifecycle line 125 says the close "stays inside the guard's five-second supervisor deadline on expiry", but it counts only the 2 s plus 1 s browser budget. The deferred forward removal (daemon.go:473-483) runs before the deferred `bundle.Stop()` (daemon.go:422), and removeForward can wait up to 6 s for the state lock (daemon.go:123) before it calls the Tailscale API.
PROPOSAL: In the summary, tie the five-second limit to expiry. In Lifecycle, note that forward removal runs before the browser stop, so a slow removal leaves Chromium to the guard's group stop under the fallback sentence that is already there.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Design (Lifecycle), AC-07, Test Plan (AC-07)
EVIDENCE: Lifecycle line 126 refuses a profile last opened by a newer Chromium "Before launching". It does not say which process runs the `--version` check or what a refusal leaves behind. The other profile refusals (owner mismatch, in-use, browser still running) run in the CLI before the session record exists, and AC-04, AC-05 and AC-06 say no record or process remains. AC-07 says only "refused before launch". If the check runs in browser.Start, it is retried three times (plugins/remote-gui/internal/browser/browser.go:284-301) and the caller sees `session-start-failed: ...` with a failed record (session.go:189-190), after Xvfb, x11vnc and websockify have started.
PROPOSAL: Run the version check in the CLI after the profile lock and before the session record is created. State in AC-07 and its proof row that the refusal leaves no record or process.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Design (Commands, Storage, Sign-in and hand-back), AC-11, AC-15
EVIDENCE: Sign-in line 131 refuses a misplaced `--agent-start-approved`. The Design says nothing about `--profile` on commands other than `start` (for example `share`, `handoff <id>`, `doctor`), or about `--profile-home` outside `start --profile` and the `profile` commands. The parser refuses other misplaced options explicitly (plugins/remote-gui/internal/config/config.go:103, :119, :165). If `handoff <id> --profile other` or `share <url> --profile x` were accepted and ignored, the owner could believe a profile is in use when it is not.
PROPOSAL: Say that `--profile` is refused outside `start`, and `--profile-home` outside `start --profile`, `profile list` and `profile delete`, like other misplaced options. Add those cases to the AC-11 or AC-15 unit tests.

FINDING: F-05
KIND: judgement
SEVERITY: nit
WHERE: AC-05, Test Plan (AC-05)
EVIDENCE: AC-05 (line 159) names the case where "the supervisor and Chromium of a profile session are killed with SIGKILL". In that case the guard survives, its finish path records the session `failed` (daemon.go:296-303, :196-201), and under the new design it clears the holder and releases the lock. The AC-05 real-browser row (line 180) kills the guard as well, which tests a different path: the kernel releases the lock and the next CLI clears a dead holder. No row exercises the guard-alive bookkeeping after an unclean supervisor exit, and no row checks recovery of the singleton files that path leaves behind.
PROPOSAL: Add an AC-05 variant that SIGKILLs only the supervisor and Chromium. Assert that the guard clears the holder and releases the lock before it records the session, and that the next start removes the stale singleton files and reaches ready.

## Sources

- [S1] auth-refresh `README.md`, Configuration section, read from the local checkout at commit `711028c` (`/home/m/code/auth-refresh`): configuration lives in `~/.config/auth-refresh/` and runtime state, including lane browser profiles, in `~/.local/share/auth-refresh/`, overridable with `AUTH_REFRESH_CONFIG` and `AUTH_REFRESH_HOME`. The marketplace pins auth-refresh at a different commit (`docs/specs/remote-gui.md:39`); the paths are used only to place remote-gui's default store elsewhere.
- [Chromium Linux password storage](https://chromium.googlesource.com/chromium/src/+/main/docs/linux/password_storage.md): returned HTTP 503 during drafting and supports no claim here. The design avoids relying on the basic store's protection.
