---
status: draft
status_description: "Normative revision after spec reviews R-13 and R-14: back to draft with every criterion reset; awaiting a spec review and the owner's acceptance."
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

Profile files are protected by private permissions only, which the README states: anyone with the owner's OS account or root can read them. Agents never list, read or copy those files; they reach a profile only through a remote-gui session. When the sessions root is overridden, a profile root must be given too. A profile last opened by a newer Chromium is refused. On stop or expiry remote-gui sends no keystrokes to a reusable profile, so nothing can reach a page or a sign-in form: Chromium gets a terminate and, if it has not exited after two seconds, a kill. A cookie written up to about half a minute before the stop may be lost, so the README says to wait about half a minute after signing in before stopping. A cookie set 30 seconds before `stop` is present in the next session in every run on a host whose load average stays below 4; on a heavily loaded host it is best effort, because tests lost one under load both before and after the latest stop fix. The two-second grace before the kill holds whenever the browser stop starts with two seconds of the guard's deadline left, and the browser stop now starts the moment the session is told to end. Clipboard behavior is unchanged for profile sessions: a handoff to agent mode still clears the remote clipboard. A new session starts on the connection page without the previous session's tabs or session-only cookies, even after a crash; persistent cookies and site storage carry over. Only sign-ins kept in persistent cookies survive, so the owner should choose a provider's "stay signed in" option, and the skill reminds them when it opens a profile in human mode. The agent opens a profile only when the owner named it.

Tasks T1 to T22 are implemented on the feature branch. Lock, ownership, name, crash-recovery, deletion, download and auth-refresh sentinel tests ran and passed there, and the real-browser package passed in full on 2026-11-13 at load 2.5 after main, with the clipboard feature, was merged in. The owner accepted the R-10 baseline. Implementation reviews R-11 and R-12 found timing gaps in AC-16, which T17 to T22 fixed. The clipboard merge made R-10 stale; spec review R-13 found no blocking gap but raised three design questions, which the owner answered on 2026-11-13: cookie persistence is best effort under heavy load, the two-second grace applies only when enough of the guard's budget is left, and profile sessions get clipboard proof. Spec review R-14 then required this revision to return to draft, so every criterion is unticked and its evidence reset (the earlier evidence stays in Git), and it scoped the clipboard privacy promise: neither the viewer nor the clipboard helper writes clipboard text to the profile store, but text pasted into a page is page input the page may keep. Every criterion needs fresh evidence after T23 to T25. A new spec review and the owner's acceptance are needed first. Acceptance authorizes implementation on the feature branch; publication, merge and release stay separate approvals.

### Background

File and line citations below were gathered at the claim commit `07217be`, before implementation moved code; the T9 measurement names its own harness.

- Chromium 151 is installed (`$REMOTE_GUI_CHROMIUM --version`). On a scratch profile it wrote `SingletonLock -> fedora-43-4080313`, a symlink to the hostname and PID joined by a hyphen, beside `SingletonCookie` and `SingletonSocket` symlinks; the hostname itself contains a hyphen, so the PID follows the last one. After SIGTERM, all three symlinks were still present (command run 2026-11-09 with `--headless=new --user-data-dir=<scratch>`).
- Each browser session creates `<home>/<id>/profile` with `os.Mkdir`, which fails if it exists, and writes a whole new `Default/Preferences` file that disables the password manager and credential service, points downloads at the session's `downloads` directory and sets `restore_on_startup` to 1 (`plugins/remote-gui/internal/browser/browser.go:303-321`).
- Stop sends SIGTERM to every owned child, then SIGKILL after three seconds, and deletes `profile`, `downloads`, `Xauthority` and `vnc.passwd` (`plugins/remote-gui/internal/browser/browser.go:219-260`). The session record `state.json` stays in the session directory and stopped records remain visible to `status` and `cleanup` (`plugins/remote-gui/internal/state/state.go:173-216`, `plugins/remote-gui/internal/session/daemon.go:641-658`). Only the handoff closes Chromium gracefully, through the owned x11vnc connection and the native Exit menu (`plugins/remote-gui/internal/browser/quit.go:19-29`).
- Chromium starts with `--user-data-dir`, `--restore-last-session` and `--password-store=basic`, and without sync or extensions (`plugins/remote-gui/internal/browser/phase.go:20-32`). Agent mode adds `--enable-automation` and loopback remote debugging (`plugins/remote-gui/internal/browser/phase.go:33-35`). Human mode rejects automation and debugging arguments (`plugins/remote-gui/internal/browser/phase.go:54-55`).
- The human-login feature configures native last-session restore from the first launch so session cookies and tab storage survive an in-session handoff (`docs/specs/remote-gui-human-login.md:131`, with its source S4 on the `RestoreOnStartup` setting). In a profile that is kept, the same setting would also restore the previous session at the next session's first launch. Chromium also restores old session cookies after a crash, whatever the startup setting. Review R-3 (finding F-07) measured this with the host's Chromium 151.0.7922.137 (`--headless=new`, a scratch profile and a local cookie fixture): `profile.exit_type` reads `Crashed` while the browser runs and after a SIGKILL, and relaunching that profile unchanged sent `sess=1; pers=1`. A copy with `exit_type` set to `Normal` and `restore_on_startup` 5 sent only `pers=1`, and a later relaunch with `restore_on_startup` 1 and `--restore-last-session` still sent only `pers=1`. A fresh profile first launched with `restore_on_startup` 5, closed with CDP `Browser.close`, then relaunched with 1 and `--restore-last-session`, kept `sess=1`.
- The session state root defaults to `$XDG_STATE_HOME/remote-gui/sessions`, or `~/.local/state/remote-gui/sessions`, and `REMOTE_GUI_HOME` or `--home` override it (`plugins/remote-gui/internal/config/config.go:33-43`, `:65`).
- State uses an exclusive non-blocking `flock` on a private `.lock` file (`plugins/remote-gui/internal/state/state.go:105-132`), records the pinned `owner_login` (`plugins/remote-gui/internal/state/state.go:43`) and identifies processes by PID plus birth metadata (`plugins/remote-gui/internal/state/state.go:280-320`).
- Measured during T9 on 2026-11-10 with Chromium 151.0.7922.137 on Xvfb, sending keys through the owned x11vnc connection, using the uncommitted T9 real-browser test in `plugins/remote-gui/internal/browser/browser_test.go` and a scratch build with an added Return step driven by a trial script against a logging fixture page: a JavaScript `alert` did not block the native Exit path (clean exit in 1.15 s), while a `beforeunload` prompt armed by a real click did. After a blocked Exit, Chromium exited 0.4 to 0.7 s after SIGTERM, yet a cookie set just before the stop was missing in the next launch in 4 of 12 manual runs and 2 of 5 test runs. One Return after the Exit keys confirmed the prompt: 13 of 13 clean exits (`exit_type` `Normal`) 1.74 to 1.91 s after the close began, with the cookie kept in 12 of 12 relaunches. Two prompting tabs needed exactly two Returns: 11 of 11 clean exits at 2.65 to 2.93 s, cookie kept 11 of 11. A Return sent with no prompt showing never reached a page in 12 trials. The existing Exit keys do reach the focused page, and in 1 of 12 trials the menu did not open, so Exit failed and the terminate ran.
- Review R-8 measured on 2026-11-10, with the host Chromium 151 on a private Xvfb and keys sent over RFB through x11vnc: after the owner dismissed a "Leave site?" prompt with Stay, the prompting provider tab kept focus and the next Return submitted its form; in a provider popup window, Ctrl+1 and the Exit keys reached the popup, typed `x` into its field and both Returns submitted it.
- Review R-9 measured the keyless close on 2026-11-10 with Chromium 151.0.7922.137 headed on a private Xvfb, the `browserArgs` launch flags and a loopback fixture: a persistent cookie was set, SIGTERM followed D seconds later with SIGKILL two seconds after that, and a relaunch echoed the cookie. Chromium exited 0.03 to 0.17 s after SIGTERM and recorded `profile.exit_type` `SessionEnded` every time. The cookie was kept 4 of 5 times at D=1 s, 3 of 5 at 10 s, 2 of 3 at 20 s, and 18 of 18 at 28 to 32 s; localStorage was kept 9 of 9 at 1, 10 and 30 s.
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
- A keyless close on stop and expiry, a terminate and then a kill, and a clean-exit mark before each first launch, for sessions with a reusable profile.
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
- After T9 on 2026-11-10: describe the `cleanup` recovery as ending `stopped` or `failed`, with `cleanup` itself unchanged. Its leave-prompt confirmation was later superseded by the R-8 decision.
- After R-7 on 2026-11-10: its wording fixes still apply; its Ctrl+1 focus and longer exit window were superseded by the R-8 decision.
- After R-8 on 2026-11-10: stop sends no keys to a reusable profile and uses a terminate and a kill only, with the half-minute advice and its proof; this replaces the leave-prompt confirmation, the Ctrl+1 focus and the longer exit window chosen after T9 and R-7.
- After R-9 on 2026-11-10: fix the wording only, then review once more and accept if that review finds no blocking gap.
- After R-12 on 2026-11-13: start the browser stop from a watcher the moment the supervisor's context is canceled, so startup state updates cannot delay it (T21, T22).
- After R-13 on 2026-11-13: cookie persistence is best effort, guaranteed in every run only on a host whose one-minute load average stays below 4; the two-second grace applies when the browser stop starts with at least two seconds of the guard's deadline left, with proof for an interrupted close and for a supervisor that never starts its browser stop; reusable profiles keep the clipboard feature's behavior, with proof on a profile session.

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

After taking the lock, the CLI checks `meta.json`. A holder recorded there whose guard identity is no longer alive is cleared and the recovery is noted in the new session's record. Still before creating the session record, the CLI checks Chromium's singleton files, as `profile delete` does. If `SingletonLock` exists, the CLI connects to the Unix socket that `SingletonSocket` points to. A successful connection means a live Chromium is using the profile, however its directory was spelled, and the start fails with `profile-browser-still-running`, leaving no record or process. A missing target or a refused connection, which also covers a lock from another hostname or another PID namespace, means the files are stale: the CLI removes `SingletonLock`, `SingletonSocket` and `SingletonCookie` and continues. The CLI never connects to anything outside the socket path the symlink names. The diagnostic names the session whose record owns that browser process when there is one, and says to run `cleanup` until that session is no longer `cleanup-pending`, when it reports `stopped` or `failed`, since one `cleanup` pass can end before the browser has exited; `cleanup` stops an orphaned remote-gui browser through its record; for a browser the owner started by hand, it says to close that browser.

### Lifecycle

- First launch in a session: remote-gui sets the startup setting to open the New Tab page instead of the last session, sets `profile.exit_type` to `Normal` so Chromium does not treat an earlier crash or SIGKILL as a reason to restore session cookies, and starts Chromium without `--restore-last-session`, with the marker URL as its only page. Persistent cookies and site storage carry over. The previous session's tabs and session-only cookies do not, whether that session ended cleanly or not. A provider that keeps its sign-in only in a session cookie therefore asks for a new sign-in each session unless the owner chose its "stay signed in" option.
- In-session handoff: before each relaunch, remote-gui sets the startup setting back to last-session restore (`restore_on_startup` 1) and keeps `--restore-last-session`, so handoffs keep tabs, session cookies and tab storage as today.
- Stop and expiry with a reusable profile: the supervisor's browser stop sends no key to Chromium. It starts as soon as the supervisor's context is canceled, at any point after the browser launch, right after the proxy rejects viewer access, so neither forward removal nor a startup state update delays it. It sends SIGTERM to Chromium alone and waits up to two seconds, then SIGKILL if it is still running, closes the clipboard helper, and stops the remaining children as today, with the X server after Chromium. When the guard kills the supervisor before that close finishes, the supervisor's death closes the clipboard helper's connection, because the helper runs inside the supervisor, and the guard's group stop then ends the remaining members with no ordering between Chromium and the X server. On expiry the browser close therefore normally ends within about two seconds, inside the guard's five-second supervisor deadline. When the browser stop starts with less than two seconds of that deadline left, or never starts, the guard's group stop ends Chromium as today, with about 300 ms before its kill; when stopping the other children runs past the deadline, the guard's group stop ends them after Chromium has exited. On `stop` the same close ends well before the `stop` command's ten-second wait. The guard and `stop` deadlines stay unchanged. A cookie Chromium has already written to disk survives. One written up to about half a minute before the stop may be lost, as review R-9 measured, so the README says to wait about half a minute after signing in before stopping. On a heavily loaded host even a cookie written 30 seconds before the stop can be lost, so cookie persistence is best effort there and the README says so. The handoff keeps its existing keyboard Exit.
- Before launching, remote-gui reads the installed Chromium's major version with `--version`. A profile last opened by a newer major version is refused with `profile-chromium-newer`, so Chromium never downgrades its data. The owner upgrades Chromium or deletes the profile.
- There is no retention timer. `profile delete` is the only way a profile is removed.

### Sign-in and hand-back

A session with `--profile` starts in human mode when no mode is given, whether it creates the profile or reuses it. `start --profile <name> --browser-mode agent` fails with `profile-requires-human-start` unless `--agent-start-approved` is also given. The flag applies to that one session and is recorded as `agent_start_approved: true` on its session record; it is never stored on the profile. Given without `--profile` and `--browser-mode agent`, or on any other command, it is refused like other misplaced options.

The skill passes `--profile <name>` only for a profile the owner named in the current task or in persistent instructions, and never creates or picks a profile on its own. It passes `--agent-start-approved` only when the owner has explicitly approved agent use of that named profile in the current task. Otherwise it starts in human mode and hands off to the agent only after the owner confirms, as it does today. In either case, a sign-in, MFA or other credential challenge in agent mode requires `handoff <id> --browser-mode human` before any entry, and the agent never enters credentials. When it opens a profile in human mode, the skill reminds the owner to choose the provider's "stay signed in" option. The skill states that a reused profile may already be signed in, that the agent must verify the provider page before acting, and that reuse grants no new provider permission. The skill's lock rule changes to say that remote-gui itself recovers stale Chromium locks in reusable profiles, and that agents still never delete lock files or force a launch by hand. Agents never list, read or copy files under the profile store; they reach a profile only through a remote-gui session.

### Working with auth-refresh

auth-refresh keeps configured identities current and drives their sign-in end to end; the skill keeps routing configured CLI and SSO identities there first. remote-gui profiles are for sign-ins auth-refresh cannot drive and for pages the owner needs to see. remote-gui never reads auth-refresh files, and its default profile store sits outside auth-refresh's directories. The skill tells agents not to open a remote-gui profile for an identity that auth-refresh owns.

### Compatibility

Without `--profile`, every command, record and output stays as it is, and existing records gain no fields. A session with a profile adds `profile` and, when given, `agent_start_approved` to its record and `profile` to `status` and `access` output. Old supervisors predate the flag and never see a profile. `cleanup` behaves as today and does not touch profiles. A session with a profile keeps the clipboard feature's behavior: every handoff to agent mode clears and verifies the remote clipboard, the clipboard panel works as in any session, and neither the viewer nor the clipboard helper writes clipboard text to the profile store. Text the owner pastes into a remote page is page input like typed text: the page can keep it in site storage, which a reusable profile retains.

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
- [ ] AC-02: A persistent cookie set in one `--profile` session at least 30 seconds before that session stops is present in a later session on the same profile, in every run on a host whose one-minute load average stays below 4; under heavier load it is best effort. The first session's `downloads`, `Xauthority`, `vnc.passwd` and `control.sock` are gone and its stopped record remains.
- [ ] AC-03: A later session on a reused profile opens with only the connection page: tabs and session-only cookies from the previous session are absent after a `stop`, an expiry and a SIGKILL of the previous session, while handoffs within a session still keep tabs, session cookies and tab storage.
- [ ] AC-04: A second session cannot start on a profile while another live session holds it, gets `profile-in-use` naming the holder's session ID or `holder: starting`, and leaves no record or process behind, and `profile list` never causes a start to fail.
- [ ] AC-05: After the supervisor and Chromium of a profile session are killed with SIGKILL, or when the leftover lock names another hostname, a new session on the same profile starts and works, while a profile whose Chromium is still running is refused with `profile-browser-still-running`, however that browser spelled the profile directory, leaving no record or process and naming the owning session and a recovery that works.
- [ ] AC-06: A session whose resolved owner differs from the profile owner, or of a different transport kind, cannot open the profile, no record or process is created, and Chromium never launches on a profile whose owner the supervisor has not matched.
- [ ] AC-07: Invalid profile names are refused before any file is touched, and a profile last opened by a newer Chromium major version is refused before launch.
- [ ] AC-08: The profile store's own paths are private to the runtime's OS account and not followed through symlinks, and the README states that a reusable profile is protected only by file permissions and the host account boundary.
- [ ] AC-09: A download in a later session lands in that session's own download directory, and preferences Chromium saved in the profile survive across sessions.
- [ ] AC-10: `profile list` shows each profile with its owner, transport kind, times and holder, `profile delete` removes an idle profile completely and refuses one held by a session or used by a running Chromium, and `status` and `access` name a session's profile.
- [ ] AC-11: Credential entry on a reusable profile happens only in human mode. A session with `--profile` starts in human mode unless `--agent-start-approved` is given, the skill gives the agent control only after a confirmed handoff or on the owner's explicit approval in the current task, and the agent opens only a profile the owner named and never reads profile files directly.
- [ ] AC-12: auth-refresh files stay unread and unchanged by every profile command, and the default profile store lies outside auth-refresh's default directories.
- [ ] AC-13: The README and skill describe reusable profiles with the glossary terms, the opt-in flag, owner binding, locking, deletion, the at-rest protection, the provider expiry limitation, that only persistent sign-ins survive and the "stay signed in" advice, the recovery for `profile-browser-still-running`, that stop sends no keys and that a sign-in should be left about half a minute before stopping, the rule that agents never read profile files, and auth-refresh as the first route for sign-in.
- [ ] AC-14: The module's race tests, vet, pinned lint and tidy checks pass, and service shares, browser phases, owner access and `cleanup` keep their behavior for sessions without a profile.
- [ ] AC-15: With an overridden sessions root, `--profile` and the `profile` commands fail with `profile-home-required` unless a profile root override is given, and with one they use that root.
- [ ] AC-16: A reusable profile session stopped by `stop` or by expiry sends no key to Chromium. When its browser stop starts with at least two seconds of the guard's five-second supervisor deadline left, it ends Chromium with a terminate and, two seconds later, a kill if needed; when less is left, or the browser stop never starts, the guard's group stop ends Chromium. A persistent cookie set 30 seconds before the stop is present in the next session in every run on a host whose one-minute load average stays below 4, and is best effort under heavier load; the README advises waiting about half a minute after signing in and says a heavily loaded host can lose a later cookie. `stop` reports `stopped` only after the holder is cleared and the lock released, and the next session's first launch marks the previous exit `Normal`.
- [ ] AC-17: A reusable profile session keeps the clipboard feature's behavior: a handoff to agent mode clears the remote clipboard, the PRIMARY selection and the cut buffer and refuses the agent launch when the clear cannot be verified, a `stop` or expiry whose supervisor close finishes before the guard's deadline closes the clipboard helper after the browser close, while in an interrupted close the supervisor's death closes the helper's connection before the guard's group stop ends the remaining members, and the next session on the same profile opens with an empty clipboard panel that sends and reads text; neither the viewer nor the clipboard helper writes clipboard text to the profile store.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Run the existing real headed-browser and lifecycle tests without `--profile`; add CLI output and record snapshot tests for `start`, `status`, `access` and `stop` without the flag. |
| AC-02 | Real browser test (`REMOTE_GUI_BROWSER_E2E=1`), sampling the one-minute load average every five seconds from the cookie being set until the next session reads it and recording the maximum; a run whose maximum reaches 4 is outside the guaranteed condition and does not count as proof: a local fixture sets a persistent cookie in session one on profile `t-reuse`; wait 30 seconds; stop; assert the named private files are absent and the stopped record remains; start session two on `t-reuse` and assert the fixture sees the cookie. |
| AC-03 | Real browser test, run three times with session one ended by `stop`, by a short expiry and by SIGKILL of its supervisor, guard and Chromium: in session one open an extra fixture tab and set a session-only cookie; hand off human to agent and back, and assert both survive; end session one; start session two and assert through CDP after a handoff to agent that only the connection page is open and the fixture sees no session-only cookie. |
| AC-04 | Unit and CLI tests: two concurrent `start --profile` calls produce one success and one `profile-in-use` naming the first session's ID or `holder: starting`; the loser leaves no session directory, record or child process; the lock stays held across an injected browser start retry; `profile list` run in a loop during concurrent starts never makes one fail; a race on a profile whose `meta.json` names a finished session reports `holder: starting`, never that session. |
| AC-05 | Real browser test: start a profile session, SIGKILL its supervisor, guard and Chromium, then start a new session on the profile and assert ready status and a working viewer. Unit tests for the singleton check: a lock whose socket target is missing, one whose socket refuses connections, and a lock naming another hostname each remove the three files and continue; a listening socket gives `profile-browser-still-running`, removes nothing and creates no session record. Real browser tests: a live Chromium started on the profile with its directory spelled through a relative path and through a symlink is refused; kill a profile session's guard and supervisor only, assert the diagnostic names that session, run `cleanup` until the session is no longer `cleanup-pending` and reports `stopped` or `failed`, then start successfully. |
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
| AC-16 | Real browser test with a fixture page holding a form and a key and submit log: stop a profile session and assert no key event or submit reached any page, including a provider popup window that has focus. Real browser test, run ten times, sampling the one-minute load average every five seconds through each run's cookie window and recording each run's maximum (a run whose maximum reaches 4 is outside the guaranteed condition and does not count toward the ten): set a persistent cookie, wait 30 seconds, `stop`, and assert the next session sees it in all ten. Start a new session on the profile immediately after `stop` returns `stopped` and assert it succeeds. Real browser test: stop a profile session and let another expire; assert `stop` reports `stopped` and Chromium's singleton files are recovered on the next start. Unit tests with a Chromium stand-in, once through `stop` and once through expiry: no key is sent, SIGTERM goes to Chromium alone first, SIGKILL follows two seconds later for a stand-in that ignores SIGTERM, the supervisor finishes before the guard's deadline, `stop` reports within its wait, the guard clears the holder, and the next first launch sets `profile.exit_type` to `Normal`. Stand-in test of an interrupted close: on expiry the browser stop starts with less than two seconds of the guard's deadline left; assert no key is sent, the browser stop's SIGTERM arrives first and the guard's group stop kills the stand-in, and the holder is cleared. Stand-in test of a supervisor that never starts its browser stop: assert no key is sent and the guard's group stop ends the stand-in. Review the README for the half-minute advice and the loaded-host caveat. |
| AC-17 | Real browser test (`REMOTE_GUI_BROWSER_E2E=1`) on a profile session: put text in the remote clipboard, the PRIMARY selection and the cut buffer, hand off to agent mode, and assert all three are empty before the agent browser starts. Unit test with the clipboard double on a reusable-profile runtime: a failed clear refuses the agent launch with a `clipboard-` diagnostic and a retry clears again. Stand-in tests: on `stop` and on expiry with the close finishing in time, the clipboard helper closes after the browser close; in an interrupted close, the helper's connection is closed when the guard kills the supervisor, before the guard's group stop ends a SIGTERM-ignoring browser. Real browser test: start the next session on the same profile and assert the clipboard panel reads empty, then sends text that the remote page can read and reads text copied there. Real browser test: send a sentinel through the clipboard panel to the remote clipboard and read it back without pasting it into any page, stop, and assert no file in the profile store contains the sentinel. |

## Tasks

- [x] T1 `plugins/remote-gui/internal/config/config_test.go` - parser tests that fail on the current code: `start --profile` accepts only names matching `^[a-z0-9][a-z0-9-]{0,39}$` and refuses `..`, `/`, uppercase, a leading hyphen and 41 characters with `invalid-profile-name`; `--profile-home` and `REMOTE_GUI_PROFILE_HOME` set the profile root; `profile list` and `profile delete <name>` parse; with `REMOTE_GUI_HOME` or `--home` and no profile root, `start --profile`, `profile list` and `profile delete` fail with `profile-home-required`; `--agent-start-approved` without `--profile` and `--browser-mode agent`, or on `share`, `status` and `profile list`, is refused like other misplaced options (AC-07, AC-11, AC-15)
      Evidence: 2026-11-10, `go test ./internal/config/` in plugins/remote-gui, fails to build with `c.Profile undefined (type Config has no field or method Profile)` and the matching ProfileHome and ProfileAction errors, so every new case fails because the parser has no profile support yet; the module checks are expected to fail until T2 lands.
- [x] T2 `plugins/remote-gui/internal/config/config.go`, `plugins/remote-gui/cmd/remote-gui/main.go` - the new flags, the `profile` command and the profile root defaults; T1 passes and the existing config and CLI tests still pass (AC-15)
      Evidence: 2026-11-10, `go test ./internal/config/` failed to build before the change (T1), then passed; `go test -race ./...`, `go vet ./...`, golangci-lint v2.15.0 `config verify` and `run` (0 issues) and `go mod tidy -diff` passed with the REMOTE_GUI_* tool paths unset. With them set from runtime.env, the existing `TestServiceDoctorDoesNotNeedGUI` fails because it expects missing GUI tools, which is host configuration. main.go is unchanged here; the `profile` command is wired in T6.
- [x] T3 `plugins/remote-gui/internal/profile/profile_test.go` - store tests that fail because the package does not exist: modes on the store root, profile directory, `meta.json`, `.lock` and `chromium/`, and refusal when any of them is a symlink; `meta.json` fields; the lock is exclusive, the locked inode is rechecked against the path and retried once after a replacement; a recorded holder is reported only while its guard identity is alive, otherwise `holder: starting`; the singleton check removes the three files for a missing socket target, a refusing socket and a lock naming another hostname, and refuses a listening socket with `profile-browser-still-running` without removing anything; the Preferences merge keeps unrelated keys, sets the controlled keys, writes `profile.exit_type` `Normal` and the startup setting for a first launch or a handoff; a recorded newer Chromium major version gives `profile-chromium-newer` (AC-04, AC-05, AC-07, AC-08, AC-09)
      Evidence: 2026-11-10, `go test ./internal/profile/` in plugins/remote-gui fails to build with `undefined: Acquire`, `undefined: Meta` and `undefined: ReadMeta`, because the package does not exist yet; T4 makes it pass.
- [x] T4 `plugins/remote-gui/internal/profile/` - the profile store, lock, holder bookkeeping, singleton check, Preferences merge and version check; T3 passes and `go test -race ./...` passes (AC-04, AC-05, AC-07, AC-08)
      Evidence: 2026-11-10, `go test -race -count=1 ./internal/profile/` failed to build before the change (T3), then passed; `go test -race ./...`, `go vet ./...`, golangci-lint v2.15.0 `config verify` and `run` (0 issues) and `go mod tidy -diff` passed with the REMOTE_GUI_* tool paths unset. Two test corrections in this commit: the idle `profile list` case now clears the holder before release, as the guard does, and a lint finding was fixed. `state.Private` is exported so the store reuses the existing private-path helper.
- [x] T5 `plugins/remote-gui/internal/session/profile_test.go`, `plugins/remote-gui/cmd/remote-gui/main_test.go` - session and CLI tests that fail on the current code: without `--profile`, `start`, `status`, `access` and `stop` output and records are unchanged; against a fake LocalAPI with no `--owner-login`, the owner is resolved and compared before the lock; owner and transport mismatches fail with `profile-owner-mismatch` and leave no record or process; two concurrent starts give one success and one `profile-in-use` with no record or process for the loser, also when `meta.json` names a finished session; the lock passes to the guard through `ExtraFiles` and stays held across an injected start retry; the guard clears the holder, updates `last used` and releases the lock before it records `stopped`; a supervisor whose LocalAPI resolves a different owner stops before Chromium launches; `--profile` without a mode starts human, agent mode without `--agent-start-approved` fails with `profile-requires-human-start`, and with it the record holds `agent_start_approved`; `profile list`, `profile delete` and the `profile` field in `status` and `access` behave as designed (AC-01, AC-04, AC-06, AC-10, AC-11, AC-16)
      Evidence: 2026-11-10, `go test -count=1 ./internal/session/ ./cmd/...` with the REMOTE_GUI_* tool paths unset: the session package fails to build (`v.Profile undefined`, `r.ProfileRecovery undefined`, `undefined: ProfileList`, `undefined: ProfileDelete`), and `TestProfileCommands` fails with `unsupported-lifecycle-command` for `profile list`. The parser cases from T2 (`profile-requires-human-start`, `profile-home-required`) already pass. The session tests use a fake browser launcher in the re-executed supervisor and a status-only fake LocalAPI; neither starts a display or Chromium.
- [x] T6 `plugins/remote-gui/internal/session/session.go`, `plugins/remote-gui/internal/session/daemon.go`, `plugins/remote-gui/cmd/remote-gui/main.go` - the profile start path, guard lock handoff and bookkeeping, supervisor owner recheck and the `profile` commands; T5 passes and `go test -race ./...` passes (AC-01, AC-04, AC-06, AC-10, AC-11)
      Evidence: 2026-11-10, `go test -race -count=1 ./internal/session/ ./cmd/...` failed before the change (T5), then passed, and `-count=3` of the profile session tests passed; `go test -race ./...`, `go vet ./...`, golangci-lint v2.15.0 `config verify` and `run` (0 issues) and `go mod tidy -diff` passed with the REMOTE_GUI_* tool paths unset. The fake launcher replaces Chromium, so no real browser ran. Also in this commit: `session/profile.go`, a `Held.Close` that leaves the guard's inherited lock in place, the `profile_recovery` record field and the help text. The existing `TestChangedPrivateSocketPathIsPreserved` leaves a guard running after each run, also on the clipboard branch; those guards were killed by PID and the test is unchanged.
- [x] T7 `plugins/remote-gui/internal/browser/lifecycle_test.go`, `plugins/remote-gui/internal/browser/browser_test.go` - ungated tests that fail on the current code: a profile session's first launch omits `--restore-last-session` and uses the profile's `chromium/` directory and the session's own downloads; a handoff relaunch restores the last session; with a Chromium stand-in that ignores Exit, stop and expiry send SIGTERM after two seconds and SIGKILL one second later to a stand-in that also ignores SIGTERM, finishing inside the guard's deadline; a session without a profile still gets a fresh disposable profile (AC-01, AC-03, AC-09, AC-16)
      Evidence: 2026-11-10, `go test -count=1 ./internal/browser/` with the REMOTE_GUI_* tool paths unset fails to build (`unknown field reusable`, `r.prepare undefined`, `r.prepareLaunch undefined`), because the runtime has no reusable-profile launch or bounded close yet. The stand-ins are the test binary re-executed as a fake x11vnc that accepts the password handshake and ignores keys, and as a browser that ignores SIGTERM; the stop and expiry cases run full sessions with them through a stand-in launcher. All new tests went into lifecycle_test.go.
- [x] T8 `plugins/remote-gui/internal/browser/browser.go`, `plugins/remote-gui/internal/browser/phase.go` - the reusable-profile launch, the startup-setting switch and the bounded close; T7 passes and `go test -race ./...` passes (AC-03, AC-16)
      Evidence: 2026-11-10, `go test -race -count=1 ./internal/browser/` failed to build before the change (T7), then passed: the stand-in got SIGTERM about two seconds after stop began and died about one second later, inside 4.5 seconds, and the stop and expiry sessions ended `stopped` with the holder cleared. `REMOTE_GUI_BROWSER_E2E=1 go test ./internal/browser -run 'TestRealHeadedBrowser|TestRealHumanBrowserHandoff'` passed with the host Chromium. The module checks passed (race tests, vet, golangci-lint v2.15.0 `config verify` and `run` with 0 issues, `go mod tidy -diff`) with the REMOTE_GUI_* tool paths unset. browser_test.go changes only for the new `browserArgs` parameter.
- [x] T9 `plugins/remote-gui/internal/browser/browser_test.go` - real-browser tests under `REMOTE_GUI_BROWSER_E2E=1`: a persistent cookie survives into a later session while the first session's private files are gone and its stopped record remains; tabs and session-only cookies are absent after a `stop`, a short expiry and a SIGKILL, while in-session handoffs keep them; after a SIGKILL of the supervisor, guard and Chromium a new session works; a live Chromium on the profile spelled through a relative path and through a symlink is refused; killing only the guard and supervisor gives a diagnostic naming the session, and `cleanup` until the session is no longer `cleanup-pending` lets a start succeed; a later download lands in its own session directory and an unrelated preference survives; a start right after `stop` returns `stopped` succeeds; all pass (AC-02, AC-03, AC-05, AC-09, AC-16)
      Evidence: 2026-11-10, `REMOTE_GUI_BROWSER_E2E=1 go test -count=1 ./internal/browser -run TestRealReusableProfile` with Chromium 151.0.7922.137 passed: stop (43 s), expiry (46 s) and SIGKILL (13 s) variants, plus the still-running case. The stop variant waits 31 s between setting the persistent cookie and `stop`, and starts the next session right after `stop` returns `stopped`. These tests check behaviour from T6 and T8, so there was no product failure to watch; the earlier failures were test races. A start right after a SIGKILL is refused while Chromium's helper processes still hold its singleton socket, so the test waits for the socket to refuse, and a hand-started browser counts once its socket answers. The `profile-browser-still-running` diagnostic now uses the revised cleanup wording in session/profile.go. Module checks passed with the REMOTE_GUI_* tool paths unset. Stop still uses the T8 keyboard Exit until T15.
- [x] T14 `plugins/remote-gui/internal/browser/lifecycle_test.go`, `plugins/remote-gui/internal/browser/browser_test.go` - tests that fail on the current close: for `stop` and expiry a Chromium stand-in receives no key, gets SIGTERM first and SIGKILL two seconds later if it ignores SIGTERM; under `REMOTE_GUI_BROWSER_E2E=1`, stopping a profile session sends no key or submit to any page, including a focused provider popup, and a persistent cookie set 30 seconds before `stop` is present in the next session in ten of ten runs. They fail because the close still sends the Exit keys (AC-16)
      Evidence: 2026-11-10, `go test -count=1 ./internal/browser -run 'TestReusableStop|TestReusableProfileStopAndExpiry|TestDelayedSupervisor'` with the REMOTE_GUI_* tool paths unset fails on the current close: the fake x11vnc logged keysyms 233, 102, 102, 233, 120, 120 (Alt, f, x), and SIGTERM reached the stand-in 2.00 s after `stop` and 2.02 s after expiry. `REMOTE_GUI_BROWSER_E2E=1 go test ./internal/browser -run TestRealReusableProfileStopSendsNoKeys` fails with `stop sent input to a page: [/key?k=Alt /key?k=f]`, with a focused popup window made by CDP `Target.createTarget`. The review R-10 case, where a supervisor delayed past the guard's deadline leaves Chromium to the guard's group stop, already passes, because that supervisor never reaches its browser stop. The ten-run cookie test was not run before T15.
- [x] T15 `plugins/remote-gui/internal/browser/browser.go` - a keyless stop close for reusable profiles: SIGTERM to Chromium alone, SIGKILL after two seconds, then the remaining children, leaving the handoff's keyboard Exit unchanged; T14 passes and `go test -race ./...` passes (AC-16)
      Evidence: 2026-11-10, the T14 stand-in tests failed before the change and pass after it (`go test -race -count=1 ./internal/browser -run 'TestReusable|TestDelayedSupervisor'`): no key reached the fake x11vnc, SIGTERM came first and SIGKILL about two seconds later, on stop and on expiry. `REMOTE_GUI_BROWSER_E2E=1 go test -count=1 ./internal/browser -run TestReal -timeout 25m` passed in 489 s with Chromium 151.0.7922.137: no key or submit reached the page or the focused popup, a cookie set 30 seconds before `stop` was present in the next session in 10 of 10 chained runs, the T9 reuse, SIGKILL and still-running cases passed, and so did the existing headed and handoff tests. Module checks passed with the REMOTE_GUI_* tool paths unset. The handoff keeps its keyboard Exit.
- [x] T10 `tests/remote-gui/native-routing.e2e.test.ts`, `tests/remote-gui/fixtures/native-routing.ts` - routing fixtures that set a profile home: the agent uses `--profile` only for a profile the owner named; without approval it starts human and hands off only after confirmation; with approval it passes `--agent-start-approved`; an agent-mode credential challenge leads to a handoff to human before any entry; the agent reminds the owner about "stay signed in" and never reads profile files; all pass (AC-11)
      Evidence: 2026-11-10, `REMOTE_GUI_ROUTING_E2E=1 REMOTE_GUI_ROUTING_CASES=<cases> bun test tests/remote-gui/native-routing.e2e.test.ts` with Copilot CLI 1.0.51. Against the committed skill, `profile-named` failed (`the owner-named profile was not opened`) and so did `profile-unapproved` (`an unapproved profile start enabled agent mode`). With the T12 skill text, the final run passed `profile-named`, `profile-unnamed`, `profile-unapproved`, `profile-approved` and `profile-challenge`, plus the existing `unknown-login`, `nonlogin` and `owned-challenge`. Earlier runs on that text failed: once with no "stay signed in" reminder after a failed start, once touching profile files, and once with `--agent-start-approved` passed without approval; the skill wording was tightened and both approval cases then passed twice in a row. These are model runs, so they can still fail on a rerun. The fixture sets `REMOTE_GUI_PROFILE_HOME` for every case and a display that fails after `doctor`, so `start` arguments are graded without a browser; the challenge case uses a synthetic live-looking session. The skill text lands in T12.
- [x] T11 `tests/remote-gui/profile.e2e.test.ts` - CLI scenarios with sentinel files in temporary `~/.config/auth-refresh` and `~/.local/share/auth-refresh` trees, each with its access time set earlier than its modification time: create, reuse, race, list and delete profiles, then assert the sentinel hashes and access times are unchanged and the default store lies outside both trees; passes (AC-12)
      Evidence: 2026-11-10, `REMOTE_GUI_BROWSER_E2E=1 REMOTE_GUI_TEST_BINARY=<fresh build> bun test tests/remote-gui/profile.e2e.test.ts` passed in 37 s. It runs the real CLI and GUI tools under a temporary HOME with the default store, creates and reuses `t-reuse` with a cookie set 31 s before `stop`, races two starts on `t-race` (one `profile-in-use` naming its holder), lists both with holders, refuses to delete a profile in use, then deletes both and repeats a delete. Sentinels in `~/.config/auth-refresh` and `~/.local/share/auth-refresh` kept their hashes, access and modification times, and the default store lies outside both trees. A separate check on this host's /tmp tmpfs confirmed that reading a file whose atime precedes its mtime updates the atime. The test needs REMOTE_GUI_TEST_BINARY and REMOTE_GUI_BROWSER_E2E, so `bun test tests/remote-gui` alone skips it, and CI does not run it yet.
- [x] T12 `plugins/remote-gui/README.md`, `plugins/remote-gui/skills/remote-gui/SKILL.md` - reusable profiles with the glossary terms, the opt-in flag, owner binding, locking, deletion, file-permission protection, provider expiry, persistent sign-ins only with the "stay signed in" advice, that stop sends no keys and that a sign-in should be left about half a minute before stopping, the `cleanup` recovery ending `stopped` or `failed`, the rule that agents never read profile files, the changed lock rule, and auth-refresh as the first route for sign-in; `bun test tests/remote-gui/package.test.ts` and `bun test tests/vh-adlc` pass (AC-13)
      Evidence: 2026-11-10, `bun test tests/remote-gui/package.test.ts` passed (10 tests). `bun test tests/vh-adlc` fails the same 139 tests with and without this change (compared by restoring the committed README and skill), all in fixture builds and GitHub adapters unrelated to remote-gui, so that suite gives no signal here. The README section and skill bullets were reviewed against the glossary and design; the skill text is what the T10 routing runs exercised.
- [x] T13 `plugins/remote-gui/` - the full check set: `go test -race ./...`, `go vet ./...`, golangci-lint v2.15.0 `config verify` and `run`, `go mod tidy -diff`, the existing headed-browser and lifecycle tests without `--profile`, and the existing `tests/remote-gui` fixtures; all pass, with any regression fixed in this commit (AC-01, AC-14)
      Evidence: 2026-11-10, in plugins/remote-gui: `go test -race -count=1 ./...` with the REMOTE_GUI_* tool paths unset, `go vet ./...`, golangci-lint v2.15.0 `config verify` and `run` (0 issues) and `go mod tidy -diff` passed. `REMOTE_GUI_BROWSER_E2E=1 go test -race -count=1 ./internal/browser` passed in 502 s, including the existing headed, handoff and component crash and expiry tests without `--profile`. `REMOTE_GUI_BROWSER_E2E=1 REMOTE_GUI_VIEWER_E2E=1 bun test tests/remote-gui` passed 16 tests and skipped 29 behind their native, routing, SSH or Firefox gates (the routing cases ran separately for T10). No regression needed a fix.
- [x] T16 `plugins/remote-gui/internal/browser/browser_test.go` - a real-browser test under `REMOTE_GUI_BROWSER_E2E=1`: start a profile session, kill only its guard and supervisor so its Chromium keeps using the profile, and assert `profile delete` fails with `profile-browser-still-running` and leaves the profile intact; then run `cleanup` until the session is no longer `cleanup-pending` and assert `profile delete` removes the profile completely; passes (AC-10)
      Evidence: 2026-11-10, `REMOTE_GUI_BROWSER_E2E=1 go test -count=1 ./internal/browser -run TestRealReusableProfileDeleteWhileBrowserRuns` passed three times with Chromium 151.0.7922.137: after only the guard and supervisor were killed, Chromium stayed alive, `profile delete` failed with `profile-browser-still-running` naming the session and left meta.json, .lock, Preferences, SingletonLock and the browser untouched; after `cleanup` until the session was no longer `cleanup-pending`, `profile delete` returned `deleted`, the directory was gone and `profile list` was empty. The test checks existing behaviour, so there was no product failure to watch. Module checks passed with the REMOTE_GUI_* tool paths unset.
- [x] T17 `plugins/remote-gui/internal/session/profile_test.go` - tests that fail on the current shutdown: on expiry of a reusable-profile session whose forward removal is delayed by four seconds, the proxy rejects access first and the browser stop then starts without waiting for forward removal, so a SIGTERM-ignoring stand-in gets SIGTERM and is killed two seconds later, never by the guard's group stop; the same holds on `stop` (AC-16)
      Evidence: 2026-11-10, `go test -count=1 ./internal/session -run TestProfileBrowserStopDoesNotWaitForForwardRemoval` with the REMOTE_GUI_* tool paths unset fails on the current shutdown: SIGTERM reached the stand-in 3.98 s after expiry and 4.01 s after `stop`, because the browser stop waits for forward removal. The test delays forward removal by holding, from the test process for four seconds, the state lock that `removeForward` must take; on `stop` it takes the lock once the record reads `stopping`. The stand-in browser ignores SIGTERM, and the session fake closes it with SIGTERM, then SIGKILL two seconds later.
- [x] T18 `plugins/remote-gui/internal/session/daemon.go` - for reusable-profile sessions, start the browser stop right after the proxy rejects access, concurrently with forward removal, keeping the existing order for sessions without a profile; T17 passes and `go test -race ./...` passes (AC-16)
      Evidence: 2026-11-10, `go test -race -count=1 ./internal/session -run TestProfileBrowserStopDoesNotWaitForForwardRemoval` failed before the change (T17), then passed three times in a row: with forward removal held for four seconds, an enrolled viewer was rejected once the browser stop began, SIGTERM reached the stand-in promptly after expiry and after `stop`, it died about two seconds later from the session's own kill with a single SIGTERM, and the holder was cleared. Under `-race` the supervisor writes its end-of-stop marker just after the browser dies, so the test now polls up to two seconds for that marker. `go test -race ./...` (REMOTE_GUI_* tool paths unset), `go vet ./...`, golangci-lint v2.15.0 `run` (0 issues) and `go mod tidy -diff` passed. Sessions without a profile keep the existing order.
- [x] T19 `plugins/remote-gui/internal/session/profile_test.go` - a test that fails on the current code: a first `start --profile` refused by any check after the lock, such as an unavailable Chromium version, leaves no profile directory or `meta.json`, and a later start of the same name on another transport kind succeeds (AC-06, AC-07)
      Evidence: 2026-11-10, `go test -count=1 ./internal/session -run TestRefusedFirstStartLeavesNoProfile` with the REMOTE_GUI_* tool paths unset fails with `a refused first start left a profile directory`: a Tailscale first start refused with `chromium-version-unavailable` (REMOTE_GUI_CHROMIUM pointing at a missing file) creates `profiles/fresh`. The test then expects a loopback start on that name to succeed and bind the profile to loopback.
- [x] T20 `plugins/remote-gui/internal/session/profile.go` - write a new profile's metadata only after every refusal check has passed, and remove a profile directory that a refused first start created; T19 passes and `go test -race ./...` passes (AC-06, AC-07)
      Evidence: 2026-11-10, `go test -count=1 ./internal/session -run TestRefusedFirstStartLeavesNoProfile` failed before the change (T19), then passed: the refused Tailscale first start left no `profiles/fresh` and `profile list` was empty, and the later loopback start succeeded with the profile bound to loopback. The other profile session tests still pass. `go test -race ./...` (REMOTE_GUI_* tool paths unset), `go vet ./...`, golangci-lint v2.15.0 `config verify` and `run` (0 issues) and `go mod tidy -diff` passed. Only a directory that did not exist before this start's lock is removed; an existing profile is never removed by a refusal.
- [x] T21 `plugins/remote-gui/internal/session/profile_test.go` - tests that fail on the current shutdown: a reusable-profile session expires, and separately is stopped, while its supervisor is still starting after the browser launch and blocked on the shared state lock held from the test process (before `ready`); a SIGTERM-ignoring stand-in gets SIGTERM promptly after expiry or `stop` and is killed by the session's own kill two seconds later, never by the guard's group stop; the stand-in close also records that the proxy already rejects an enrolled viewer when the browser stop begins, here and in the T17 test (AC-16)
      Evidence: 2026-11-13, `go test -race -count=1 ./internal/session -run TestProfileBrowserStopDuringStartup` with the REMOTE_GUI_* tool paths unset fails on the current shutdown in 3 of 3 runs: SIGTERM first reached the stand-in 4.97 to 5.08 s after expiry (TTL 2.7 s) and 6.70 to 6.90 s after `stop`. The test keeps the supervisor in its startup probe with a fake viewer that answers 503 until the test opens it, takes the root state lock once `Origin` is recorded, opens the viewer, and waits for the probe's WebSocket, so the supervisor is blocked recording `ready`; the record still reads `starting` when the session ends. The stand-in close now repeats a viewer request through the proxy when it begins and records the answer: here it must be 410, and in `TestProfileBrowserStopDoesNotWaitForForwardRemoval` (an enrolled viewer that got 200 before the stop) 410, or no answer within 400 ms once the supervisor has closed its server after revoking access. An enrolled viewer is impossible before `ready`, since `/access` issues codes only then, so this test probes the viewer URL without a grant, which the proxy answers with a non-410 status before the stop. The strengthened T17 test still passes on the current code.
- [x] T22 `plugins/remote-gui/internal/session/daemon.go` - for reusable-profile sessions, start the browser stop as soon as the supervisor's context is canceled at any point after the browser launch, from a watcher that rejects viewer access first, so no startup state update delays it; the stop still runs once, sessions without a profile keep the existing order; T21 and T17 pass and `go test -race ./...` passes (AC-16)
      Evidence: 2026-11-13, `go test -race -count=1 ./internal/session -run TestProfileBrowserStopDuringStartup` failed before the change (T21), then `go test -race -count=3 ./internal/session -run 'TestProfileBrowserStopDuringStartup|TestProfileBrowserStopDoesNotWaitForForwardRemoval'` passed twice in a row (6 of 6 runs of each test): during startup SIGTERM reached the stand-in 3 to 14 ms after expiry or `stop`, the proxy answered the viewer 410 when the browser stop began, and the session's own kill followed 2.00 s later with a single SIGTERM; in the T17 test SIGTERM came 5 to 14 ms after expiry and 10 to 407 ms after `stop`, with 410 on expiry and no answer on `stop`, where the supervisor's shutdown revokes access again and closes its server alongside the browser stop. For reusable-profile sessions, a watcher started right after the browser launch runs the stop, once through `sync.OnceFunc`, the moment the supervisor's context is canceled: it revokes the proxy when one exists, then stops the browser; the deferred shutdown and the early-return path call the same once-only stop. With the watcher alone the expiry case passed but `stop` still came 3.0 s late, because the `/stop` handler first waited on the state lock to mark `stopping` and `stop` fell back to signalling the guard after its three-second control timeout; the handler now skips that update, which changes nothing in `starting`, for a reusable-profile session that is still starting. Sessions without a profile keep `defer bundle.Stop()` and the existing handler order. `go test -race -count=1 ./...` (REMOTE_GUI_* tool paths unset), `go vet ./...`, golangci-lint v2.15.0 `config verify` and `run` (0 issues) and `go mod tidy -diff` passed; host load 2.5 to 7.5 from other sessions. The full run left one guard from `TestChangedPrivateSocketPathIsPreserved`, as R-12 saw, which I killed by PID.
- [ ] T23 `plugins/remote-gui/README.md` - extend the "Stop sends no keys" section: on a heavily loaded host even a cookie written 30 seconds before the stop can be lost, so persistence is best effort there; `bun test tests/remote-gui/package.test.ts` passes (AC-16)
- [ ] T24 `plugins/remote-gui/internal/browser/lifecycle_test.go` - stand-in tests: on expiry, a browser stop that starts with less than two seconds of the guard's deadline left sends no key, its SIGTERM arrives first, the guard's group stop kills the stand-in and the holder is cleared; on `stop` and on expiry with the close finishing in time the clipboard helper closes after the browser close, and in an interrupted close the helper's connection closes when the guard kills the supervisor, before the group stop ends the browser; a clipboard double on a reusable-profile runtime refuses the agent launch on a failed clear and clears again on retry; these check existing behavior, so a failure is a product defect fixed in this task (AC-16, AC-17)
- [ ] T25 `plugins/remote-gui/internal/browser/browser_test.go` - real-browser tests under `REMOTE_GUI_BROWSER_E2E=1` on a profile session: a handoff to agent mode empties the remote clipboard, PRIMARY and cut buffer before the agent browser starts; the next session on the same profile opens with an empty clipboard panel that sends and reads text; a sentinel sent and read back through the panel without being pasted into a page is in no file of the profile store after `stop`; the AC-02 and AC-16 cookie runs sample the one-minute load average every five seconds through each cookie window, log each run's maximum, and report a run whose maximum reaches 4 as outside the guaranteed condition; all pass (AC-02, AC-16, AC-17)

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
| 2026-11-10 | R-7 | spec | `decf88498d33e30c3d8f5fc43bdf87fa4baec437` | claude-opus-5-5 | procedural | No blocking findings on the post-T9 revision; two should-fix findings and four nits. |
| 2026-11-10 | R-8 | spec | `0da01c174635d7b85c8b9df6196919f7bb6cf786` | claude-opus-5-5 | procedural | Blocking: stop keystrokes can submit a provider form after Stay or in a popup window; one should-fix and one nit. |
| 2026-11-10 | R-9 | spec | `77c2cba2f75ae3da0f2bdf260b1b5bc0c63b9e65` | claude-opus-5-5 | procedural | No blocking findings on the keyless stop; one should-fix finding and four wording nits. |
| 2026-11-10 | R-10 | spec | `c482919f001d3afbbf765b782bb9232fea203cb1` | claude-opus-5-5 | procedural | No blocking findings; two should-fix findings and two nits, left in the record at the owner's direction. |
| 2026-11-10 | R-10 | spec | `c482919f001d3afbbf765b782bb9232fea203cb1` | n/a | n/a | accepted by owner |
| 2026-11-10 | R-11 | implementation | `739c0fb85db6e5ccba9b59d81ddb11ef55010bf6` | claude-opus-5-5 | procedural | Fifteen criteria met; AC-16 not met when a late browser stop gets less than two seconds before the guard kills it; one bug in a refused first start. |
| 2026-11-10 | R-12 | implementation | `e71d1f37b8cee085e6d01300daacc71e6179b85e` | claude-opus-5-5 | procedural | Fifteen criteria met and the R-11 gap fixed; AC-16 still not met when expiry hits a session that is still starting under lock contention. |
| 2026-11-13 | R-13 | spec | `6ea4aa823e0107ad1e5d7e3e90eefebfb3b6e817` | gpt-6.1-sol | procedural | No blocking findings after the clipboard merge; four should-fix findings on cookie persistence, the two-second grace, clipboard coverage and the owner summary. |
| 2026-11-13 | R-14 | spec | `a5165431340556b1c090516955d8cfa082c14679` | gpt-6.1-sol | procedural | Blocking: the normative revision must return to draft with every criterion reset; three should-fix findings on pasted text in site storage, helper shutdown in an interrupted close and load sampling. |
| 2026-11-13 | R-15 | spec | `2ff1a62336717a4a6d43d75dc857749c6b06042e` | gpt-6.1-sol | procedural | No blocking findings; one should-fix finding on how an interrupted close ends the clipboard helper. |
| 2026-11-13 | R-16 | spec | `69ba525642d043cc7576bf5d43ec7ba5ff69e9fd` | gpt-6.1-sol | procedural | No findings on the revision after R-13 to R-15. |

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

### R-7

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Lifecycle), AC-16, Test Plan (AC-16)
EVIDENCE: Lifecycle line 128 sends one Return "While Chromium is still running" about a second after the Exit keys, and a second Return a second later "if needed". Nothing checks that a leave prompt is actually showing. Background line 41 says "The existing Exit keys do reach the focused page, and in 1 of 12 trials the menu did not open, so Exit failed and the terminate ran". It does not say whether a Return was sent in that trial or what it reached. When the menu fails to open, Chromium is still running, so the design sends the Return, and nothing sits between it and the focused page. The same happens when the owner clicks "Stay" on the prompt in the viewer before the second Return goes out. The stop close does not focus a safe page first: closeReusable (plugins/remote-gui/internal/browser/browser.go:282-304) calls quitBrowser directly, while the handoff path first activates remote-gui's own marker tab through CDP (plugins/remote-gui/internal/browser/phase.go:124-130). On a signed-in provider page, a stray Return can submit a sign-in form the owner has filled in or confirm a focused button, with no confirmation from the owner or the agent. That conflicts with the goal that credential entry stays human and agent action rests on the owner's confirmation. The AC-16 row only checks "A Return sent with no prompt showing reaches no page" during an Exit that succeeds, so every box can be ticked while this path remains.
PROPOSAL: Send a Return only after confirming that a leave prompt is showing (for example by checking the owned display for Chromium's dialog), or after making the session's own marker page the focused tab where CDP exists. Add a criterion clause and a test in which the Exit menu fails or the prompt is dismissed, and assert that no Return reaches the page.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Lifecycle), Context (Background), AC-16, Test Plan (AC-16)
EVIDENCE: Lifecycle line 128 limits the Exit phase to three seconds from the start of the close and then sends SIGTERM. Background line 41 measured clean exits with two prompting tabs "at 2.65 to 2.93 s", which leaves 0.07 to 0.35 s before the terminate. Background line 41 also shows that after a terminate, a cookie set just before the stop was missing in 4 of 12 manual runs and 2 of 5 test runs. A slightly slower host or a larger profile flush therefore pushes the two-prompt case into the cookie-loss path that this revision exists to avoid, and the AC-16 real-browser assertion "no SIGTERM was sent" for two tabs becomes timing dependent. The longer close also narrows the expiry margin from two seconds to one. On expiry, proxy revocation and removeForward run before the deferred bundle.Stop (plugins/remote-gui/internal/session/daemon.go:503-512 against :454), and removeForward may wait up to 6 s for the state lock (daemon.go:123-125). If the guard's five-second deadline passes, stopMembers sends SIGKILL about 300 ms after its SIGTERM (daemon.go:88-118), while Background measures 0.4 to 0.7 s for Chromium to exit after SIGTERM.
PROPOSAL: Give the two-prompt case a stated, measured margin. For example, send the second Return as soon as the first prompt is gone, or lengthen the Exit phase on `stop`, where only the ten-second wait applies. Run the AC-16 two-tab real-browser test repeatedly so that it shows no SIGTERM under that margin.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Tasks (T15), Test Plan (AC-03, AC-16)
EVIDENCE: T15 changes plugins/remote-gui/internal/browser/quit.go. quitBrowser is shared with the handoff close (plugins/remote-gui/internal/browser/phase.go:129). Its comment says "An outstanding browser confirmation is left to the owner instead of killing it" (quit.go:17-18), and a blocked handoff returns `browser-close-needs-owner` (phase.go:136-138). Design confirms prompts only on stop and expiry, but no Test Plan row checks that a handoff with a `beforeunload` prompt still leaves it to the owner. Putting the Returns inside quitBrowser would silently confirm leave prompts during handoffs.
PROPOSAL: State that the Returns live in the stop close only, and add a check to the AC-03 or AC-16 row that a handoff with a leave prompt still ends in `browser-close-needs-owner` and sends no Return.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Context (Owner summary)
EVIDENCE: Line 30 opens with "Validation is planned, not run", yet the T2 to T8 evidence lines (lines 201-213) record executed race tests, unit tests and the real-browser runs `TestRealHeadedBrowser` and `TestRealHumanBrowserHandoff`. The summary also leaves out two material changes since the accepted R-6 scope: the Exit window grows from two seconds to three, and this revision reset the ticks and evidence of AC-04, AC-06, AC-07 and AC-15 (visible in `git diff 53803ad decf884`). The standard asks the summary to separate planned checks from observed proof and to explain material changes since the last accepted scope.
PROPOSAL: Say that task-level tests ran during T1 to T8, that criterion evidence was reset by this revision and must be gathered again, and that the Exit phase moves from two to three seconds.

FINDING: F-05
KIND: judgement
SEVERITY: nit
WHERE: Test Plan (AC-16)
EVIDENCE: AC-16 (line 173) includes "the README says a very recent sign-in may then be lost". The AC-16 proof row (line 194) contains only real-browser and unit tests and names no README check, and the AC-13 criterion list (line 170) does not name this limitation. An implementation review of AC-16 therefore has no named proof for that clause.
PROPOSAL: Add a README review step for the forced-terminate limitation to the AC-16 row, or add the limitation to AC-13 and its row.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Context (Background)
EVIDENCE: The new T9 bullet (line 41) is the basis for both changes in this revision, but it gives no command, test name or committed harness. The only harness is the uncommitted plugins/remote-gui/internal/browser/browser_test.go. Several older Background citations also no longer resolve at decf884, because T6 and T8 shifted the code. Line 35 cites browser.go:303-321 for the profile and Preferences write, but at this commit those lines are the end of closeReusable and the start of the `Start` retry loop, and the write is at browser.go:340-367. Line 36 cites browser.go:219-260 for stop, which is now browser.go:222-276. Line 42 cites session.go:302-313, which is now session.go:334-345.
PROPOSAL: Name the command or test that produced the T9 numbers, and either refresh the line citations to this commit or say which commit they were gathered at.

### R-8

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design (Lifecycle), Context (Owner summary), AC-16, Test Plan (AC-16)
EVIDENCE: Lifecycle line 131 says "A Return that finds no prompt lands on the connection tab, which has no form", and the owner summary (line 28) and AC-16 (line 176) promise that "while the connection tab is open, no stop key reaches another page". I measured this in a scratch harness (/tmp/claude-1000/-home-m-code-stackweaver/4ab9a05b-51f5-5b4a-a95c-c55054044bbd/scratchpad/m/drive.py, experiment m4). It used the host Chromium 151 with the remote-gui launch arguments on a private Xvfb :211, and sent keys over RFB through x11vnc the way quitBrowser does (plugins/remote-gui/internal/browser/quit.go). Tabs: the connection-style page, then provider tabs A and B, each with a form and with a `beforeunload` handler armed by a real click. B was active. The stop keys were Ctrl+1, a 0.4 s pause, then Alt+F and X. Esc stood in for the owner clicking Stay, and the design's next Return followed. Fixture log: Ctrl+1 gave "conn focus / conn vis visible", then the Exit keys reached conn. When the first prompt appeared, "conn vis hidden" was logged. After Stay, "A vis visible", "A focus", and the Return gave "A keydown Enter" and "A SUBMIT". Chromium was still running. Chromium makes the prompting tab the active tab to show "Leave site?". After Stay, that provider tab keeps focus while the connection tab stays open, and the design sends its Returns "While Chromium is still running" whether or not a prompt is still showing. That is the R-7 F-01 case, and this revision does not solve it: a Return submits a provider form the owner may be filling in, with no confirmation from the owner or the agent. This conflicts with the goal (line 6) that credential entry stays human-only. The AC-16 proof row asks for exactly this Stay case to show no Return reaching the provider, so the design as written cannot pass its own test.
PROPOSAL: Send a Return only when the stop can confirm that a leave dialog is what will receive it, or replace the Returns with a mechanism that cannot submit page content. Then state in the summary and in AC-16 what happens after the owner clicks Stay. Make the AC-16 Stay case explicitly put the provider tab under the prompt, with the pass condition that no form is submitted.

FINDING: F-02
KIND: factual
SEVERITY: blocking
WHERE: Design (Lifecycle), Context (Owner summary), AC-16, Test Plan (AC-16)
EVIDENCE: Lifecycle line 131 considers only the owner closing or moving the connection tab ("Ctrl+1 focuses another page"). It does not consider a second browser window, such as a popup a provider opens with `window.open` for sign-in. Same harness, experiment m3: provider tab A opened a popup window with a form after a real click, and the popup had focus. Then the design's sequence ran: Ctrl+1, the Exit keys, and a Return about a second later followed by a second one. Fixture log: "popup keydown Control", "popup keydown 1", "popup keydown Alt", "popup keydown f", "popup keydown x", then "popup keydown Enter", "popup SUBMIT value=x", and again "popup keydown Enter", "popup SUBMIT value=x". Chromium was still running afterwards, so the terminate would follow. Ctrl+1 does not leave a popup window, and the popup has no app menu, so X is typed into the focused field and both Returns submit the provider's form, here a sign-in form with an extra character. The owner summary's claim that "no stray key reaches a provider page while the connection tab is open" is false in this case, because the connection tab is open in the main window. The README limitation in the design covers only a closed or moved tab.
PROPOSAL: Specify what the stop does when the focused window is not the window holding the connection tab, for example skip all keys and go straight to the terminate path. Add a popup-window case to AC-16 and its proof row, with the pass condition that no key and no submit reach the popup.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design (Lifecycle), AC-16, Test Plan (AC-16), Tasks (T14, T15)
EVIDENCE: AC-16 says "no stop key reaches another page" while the connection tab is open, and the proof row asks a provider tab that "logs key events" to see none. Ctrl+1 is itself a stop key, and it is delivered to the focused page before Chromium switches tabs. In experiments m1 and m2 (same harness), active provider tab A logged "keydown Control ctrl=true" and "keydown 1 ctrl=true" in every run. Calling preventDefault on Ctrl+1 did not block the switch. The design also does not say how long to wait between Ctrl+1 and the Exit keys. In a first m4 run with a 0.1 s pause, provider tab B logged "keydown f alt=true" and "keydown Alt" before "conn focus". The Exit menu did not open, X landed in the connection page's input, and Chromium kept running. With a 0.4 s pause the switch settled first. The Test Plan also says "A Return sent with no prompt showing reaches no page", while Lifecycle says such a Return "lands on the connection tab", and the connection page has an autofocused input (plugins/remote-gui/internal/browser/phase.go, serveMarker). Read literally, the criterion and its proof cannot both be met, and an implementation review would have to guess which keys count.
PROPOSAL: Reword the AC-16 clause and its proof so that only Ctrl+1 may reach the page that had focus. Require the close to confirm that the switch happened, or to wait a stated, measured settle time, before sending the Exit keys. Make the no-prompt Return statements in Lifecycle and the Test Plan agree.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: AC-16
EVIDENCE: AC-16 (line 176) says a Chromium that has not exited "within four seconds on `stop` or three on expiry is terminated and then killed within the supervisor deadline". On `stop` there is no supervisor deadline. The `/stop` request goes to the supervisor's control socket, and the guard then waits on `case clean := <-wait:` with no timer (plugins/remote-gui/internal/session/daemon.go:312). The five-second SIGTERM-to-SIGKILL deadline exists only for a signal and for expiry (daemon.go:320, :328). On `stop`, only the ten-second `stop` wait applies (plugins/remote-gui/internal/session/session.go:334). The owner summary already ties the five-second deadline to expiry.
PROPOSAL: In AC-16, tie "within the supervisor deadline" to expiry, and for `stop` say "before `stop` stops waiting".

### R-9

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Context (Owner summary, Background), Design (Lifecycle)
EVIDENCE: Owner summary line 28 says "A sign-in made in the last moments before a stop may be lost", and Lifecycle line 133 says a cookie "set in the last moments may be lost", so wait "about half a minute". Context gives no command or output for the 30-second figure. The only stop measurement (Background line 43) covers a cookie set "just before the stop". I measured the new keyless close with a scratch harness (/tmp/claude-1000/-home-m-code-stackweaver/4ab9a05b-51f5-5b4a-a95c-c55054044bbd/scratchpad/r9/measure.py and measure_ls.py). It used host Chromium 151.0.7922.137 headed on a private Xvfb with the browserArgs launch flags from phase.go, a loopback fixture that sets a persistent cookie with Set-Cookie, SIGTERM D seconds later (SIGKILL after 2 s), then a relaunch that echoes the Cookie header. Chromium exited 0.03 to 0.17 s after SIGTERM, and `profile.exit_type` read `SessionEnded` every time. Cookie kept: D=1 s 4 of 5, D=10 s 3 of 5, D=20 s 2 of 3, D=28 to 32 s 18 of 18, and 12 of 12 at D=25 to 31 s when the cookie was set 38 s after an earlier one. localStorage was kept 9 of 9 at 1, 10 and 30 s. A cookie 10 to 20 seconds old can therefore be lost, which is not "the last moments". The half-minute advice and the AC-16 30-second test match what I observed, but the document does not show that evidence, and the summary understates the window the owner needs to know about.
PROPOSAL: Add a Background bullet with the measured loss window after SIGTERM (command, Chromium version, delays and counts). Replace "last moments" in the summary and Lifecycle with a statement that a cookie written up to about half a minute before the stop may be lost.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: AC-16, AC-03, Context (Owner summary), Test Plan (AC-16)
EVIDENCE: AC-16 (line 178) ends "and the next session sees a clean previous exit". AC-03 (line 165) and the summary (line 30) speak of "a clean stop". Every stop is now a SIGTERM, and in every one of my runs above, Chromium recorded `profile.exit_type` `SessionEnded`, not `Normal`. The only clean mark is the one remote-gui writes before the next first launch (Lifecycle line 131, MergePreferences in plugins/remote-gui/internal/profile/profile.go:401-402), and the AC-16 row checks it only as "the next first launch sets `profile.exit_type` to `Normal`". Read literally, "sees a clean previous exit" describes something Chromium never records under this design.
PROPOSAL: Reword AC-16 to "the next session's first launch marks the previous exit `Normal`", and say "a `stop`" instead of "a clean stop" in AC-03 and the summary.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Design (Lifecycle), AC-16
EVIDENCE: Lifecycle line 133 says "On expiry the browser close therefore ends within about two seconds, inside the guard's five-second supervisor deadline", and AC-16 promises a terminate and "after two seconds, a kill if needed, within the supervisor deadline on expiry". On expiry the forward-removal defer (plugins/remote-gui/internal/session/daemon.go:503-505) runs before the deferred `bundle.Stop()` (daemon.go:454). removeForward can wait up to 6 s (daemon.go:124). The guard SIGKILLs the supervisor 5 s after SIGTERM (daemon.go:328-333), and stopMembers then gives Chromium about 300 ms before SIGKILL (daemon.go:94-108). The previous revision covered this with "If the supervisor is killed first, the guard's group stop ends Chromium as today". This revision removed that sentence, so the design and AC-16 now claim the two-second grace in a case where it is not given.
PROPOSAL: Restore the fallback sentence in Lifecycle and limit AC-16's two-second clause to a browser stop that starts before the guard's deadline.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Design (Owner decisions)
EVIDENCE: Line 95 says the R-8 decision "replaces the leave-prompt confirmation, the Ctrl+1 focus and the longer exit window". Lines 96 and 97 still list, as current owner decisions, "focus the connection tab with Ctrl+1 before the stop keys, use a four-second exit window on `stop` and three on expiry" and "confirm up to two \"Leave site?\" prompts on stop". Both contradict Lifecycle line 133. The list is also out of order (R-8, R-7, T9, then R-5).
PROPOSAL: Mark the R-7 and T9 bullets as superseded, keeping only their parts that still apply (the R-7 wording fixes and the `cleanup` recovery wording), and put the list in chronological order.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Context (Owner summary)
EVIDENCE: Line 28 says "a test proves that a sign-in made 30 seconds before the stop survives every time". That test is T14 and has not been written or run (Tasks line 220, unticked), and line 30 says "Validation is planned, not run". A ten-run test (Test Plan AC-16) also cannot prove "every time". The standard asks the summary to distinguish planned checks from observed proof.
PROPOSAL: Say instead that a planned test checks, in ten of ten runs, that a cookie set 30 seconds before `stop` is present in the next session.

### R-10

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria (AC-02), Test Plan (AC-02), Tasks (T9)
EVIDENCE: AC-02 (line 166) says "A persistent cookie set in one `--profile` session is present in a later session on the same profile after the first session stopped", with no timing condition. The AC-02 proof row (line 187) says "a local fixture sets a persistent cookie in session one on profile `t-reuse`; stop; ... assert the fixture sees the cookie", with no wait between setting the cookie and `stop`, and T9 (line 221) repeats this. Lifecycle (line 135) and the R-9 Background bullet (line 45) accept that "one written up to about half a minute before the stop may be lost". I observed this myself with host Chromium 151.0.7922.137 headed on a private Xvfb, the browserArgs flags, a loopback Set-Cookie fixture, SIGTERM D seconds after the cookie was set and SIGKILL 2 s later, then a relaunch that echoes the Cookie header (scratch harness /tmp/claude-1000/-home-m-code-stackweaver/4ab9a05b-51f5-5b4a-a95c-c55054044bbd/scratchpad/rv10/m.py). Results: D=1 s kept 7 of 8, D=15 s kept 4 of 6, D=30 s kept 6 of 6, with Chromium exiting 0.06 to 0.27 s after SIGTERM. Under the keyless close, the AC-02 test as written fails in some runs. Read literally, AC-02 promises something the design says it does not give, and an implementation review could not mark it met from the named proof.
PROPOSAL: Qualify AC-02 to a cookie set at least 30 seconds before the stop, or one Chromium has written to disk, and add the 30-second wait to the AC-02 proof row and to T9, so that AC-02 matches Lifecycle and AC-16.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria (AC-16), Test Plan (AC-16), Design (Lifecycle)
EVIDENCE: AC-16 (line 180) says the close ends Chromium "with a terminate and, after two seconds, a kill if needed, whenever its browser stop starts before the guard's deadline, and otherwise through the guard's group stop". The AC-16 proof row (line 201) has unit tests only for the case where "the supervisor finishes before the guard's deadline" and real-browser tests for an ordinary stop and expiry. No row exercises the "otherwise through the guard's group stop" clause, for example a delayed forward removal on expiry. I found no existing test of that path either: `grep -rn 'stopMembers\|groupMembers' plugins/remote-gui --include=*.go` matches only plugins/remote-gui/internal/session/daemon.go. Under the standard, a passing subset never upgrades a composite criterion, so AC-16 can only be `untested` in an implementation review. The two-second clause also overclaims. A browser stop that starts less than two seconds before the deadline does not get two seconds: the guard SIGKILLs the supervisor 5 s after SIGTERM (daemon.go:321-337), and stopMembers then sends Chromium SIGTERM and SIGKILL about 300 ms apart (daemon.go:89-112). Lifecycle (line 135) covers only the case where the guard kills the supervisor "before its browser stop starts".
PROPOSAL: Limit the two-second clause to a browser stop that starts at least two seconds before the guard's deadline, and say in Lifecycle that a later start falls to the group stop. Add a proof for the fallback, such as a unit test with a supervisor delayed past the deadline that asserts no key is sent and Chromium is ended by the group stop.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Context (Owner summary)
EVIDENCE: Line 30 opens with "Validation is planned, not run: lock, ownership and name tests, real-browser tests ...". The same paragraph says "Tasks T1 to T8 are implemented on the feature branch, and their task-level tests ran and passed". The T1, T3, T5 and T6 evidence lines (lines 206, 210, 214, 216) record executed name, lock and owner-mismatch tests. What is still planned is the criterion-level evidence, which is all unticked. The standard asks the summary to separate planned checks from observed proof.
PROPOSAL: Say that criterion-level validation is planned and not yet run, while the task-level lock, ownership and name tests ran during T1 to T8.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Context (Background)
EVIDENCE: Line 34 says "the T9 measurement names its own harness". The R-8 bullet (line 44) and the new R-9 bullet (line 45) give a method but no command, test or harness. The standard says Context cites its claims with "a `file:line`, or a command and its output". The harness paths exist only in the R-8 and R-9 records in the Review Log. R-9 F-01 asked for the command to appear in the Background bullet.
PROPOSAL: Name the harness or command in each bullet, or say that it is recorded in the R-8 and R-9 review records.

### R-11

CRITERION: AC-01 Without `--profile`, browser sessions still start with a fresh profile that is deleted on stop and expiry, with unchanged command output and records.
VERDICT: met
EVIDENCE: `go test -race -count=1 ./...` in plugins/remote-gui with the REMOTE_GUI_* tool paths unset, plus `REMOTE_GUI_BROWSER_E2E=1 go test -race -count=1 -v ./internal/browser` with runtime.env and Chromium 151, at 739c0fb. `TestStartWithoutProfileKeepsRecordsAndOutput` passed: the record config keys were unchanged, no `profile_recovery` field, no `profile` in start, status, access or stop output, and no profile store was created. `TestRealHeadedBrowser` and all seven `TestBrowserComponentsCrashAndExpire` subtests (display, vnc, viewer-bridge, browser, supervisor, guard, expiry) passed in the gated run. `TestRealHumanBrowserHandoff` failed once with `browser-close-needs-owner` in the gated run while two `bun test tests/vh-adlc` suites loaded the host, then passed on an isolated rerun; that handoff Exit path is unchanged by this branch. Limitation: the record and output check uses a fake browser launcher.

CRITERION: AC-02 A persistent cookie set in one `--profile` session is present in a later session on the same profile after the first session stopped. The first session's `downloads`, `Xauthority`, `vnc.passwd` and `control.sock` are gone and its stopped record remains.
VERDICT: met
EVIDENCE: `REMOTE_GUI_BROWSER_E2E=1 go test -race -count=1 -v ./internal/browser -run 'TestRealHumanBrowserHandoff|TestRealReusableProfileAcrossSessions'` at 739c0fb, Chromium 151.0.7922.137: the `stop` subtest passed (40 s), with `downloads`, `Xauthority`, `vnc.passwd` and `control.sock` gone, `state.json` kept and `pers=1` seen in session two. `bun test tests/remote-gui/profile.e2e.test.ts` with a fresh CLI build also passed, carrying `pers=1` into a reused `t-reuse` under a temporary HOME. Limitations: both tests wait 31 s between setting the cookie and `stop`, as the design's half-minute caveat requires. The same subtest failed once in the full gated run with `session-start-timed-out` on session two while the host ran two other test suites; the isolated rerun passed.

CRITERION: AC-03 A later session on a reused profile opens with only the connection page: tabs and session-only cookies from the previous session are absent after a `stop`, an expiry and a SIGKILL of the previous session, while handoffs within a session still keep tabs, session cookies and tab storage.
VERDICT: met
EVIDENCE: `TestRealReusableProfileAcrossSessions` at 739c0fb passed for `stop`, `expiry` (40 s TTL) and `sigkill` (guard, supervisor and Chromium) in the isolated rerun, and `expiry` and `sigkill` also passed in the full gated run. In each case a human and agent handoff kept the extra tab and `sess=1`, and session two after a handoff to agent showed only the marker page and no `sess` cookie. The accepted proof does not check tab storage, so I ran a scratch real-browser test in a temporary copy of the module (not in the repository): it set `sessionStorage` in a fixture tab on a reusable profile, handed off to human and back to agent, and read `tab-v` and `pers=1; sess=1` again, in 2 of 2 runs. Limitation: Chromium 151 on Xvfb only.

CRITERION: AC-04 A second session cannot start on a profile while another live session holds it, gets `profile-in-use` naming the holder's session ID or `holder: starting`, and leaves no record or process behind, and `profile list` never causes a start to fail.
VERDICT: met
EVIDENCE: `go test -race -count=1 ./...` at 739c0fb: `TestConcurrentProfileStarts` passed (one success and one `profile-in-use` naming `starting` or the winner, never the seeded finished holder; one record and one guard; a looping `profile.List` never errored; a later start named the live holder), and `TestProfileStartDefaultsToHumanAndReleasesBeforeStopped` showed the lock held across the injected retry by the guard alone. `profile.e2e.test.ts` raced two real CLI starts on `t-race` and got one `profile-in-use` with a holder. A real CLI probe, where my first session was still running, refused a second start with `profile-in-use; holder: <first id>`. Limitation: the unit race uses a fake browser launcher.

CRITERION: AC-05 After the supervisor and Chromium of a profile session are killed with SIGKILL, or when the leftover lock names another hostname, a new session on the same profile starts and works, while a profile whose Chromium is still running is refused with `profile-browser-still-running`, however that browser spelled the profile directory, leaving no record or process and naming the owning session and a recovery that works.
VERDICT: met
EVIDENCE: At 739c0fb, `TestRealReusableProfileAcrossSessions/sigkill` passed twice: after the SIGKILL a new session started, its viewer page and WebSocket worked, and the singleton lock named the new browser. `TestRealReusableProfileStillRunning` passed in the gated run: hand-started Chromium through a relative path and through a symlink was refused with no new record, and after killing only guard and supervisor the refusal named the session and `cleanup`, and repeated `cleanup` let a later start succeed. Unit tests `TestSingletonCheckRecoversStaleLocks`, `TestSingletonCheckRefusesALiveBrowser` and `TestProfileStartRefusesRunningBrowserAndNewerChromium` passed. A real CLI probe with the built binary replaced the singleton files of a stopped profile with `SingletonLock -> other-host.example-4242` and a dangling socket; the next `start` returned `ready`, the lock then named the new browser, and `stop` returned `stopped`. Limitation: a start issued while Chromium helpers still hold the socket just after a SIGKILL is refused; the test waits for the socket to refuse first.

CRITERION: AC-06 A session whose resolved owner differs from the profile owner, or of a different transport kind, cannot open the profile, no record or process is created, and Chromium never launches on a profile whose owner the supervisor has not matched.
VERDICT: met
EVIDENCE: `go test -race -count=1 ./...` at 739c0fb: `TestProfileOwnerAndTransportBinding` passed (owner mismatch, while held and while free, and both transport mismatches gave `profile-owner-mismatch` with no record or guard, against a status-only fake LocalAPI with no `--owner-login`, which was called), and `TestSupervisorRechecksOwnerBeforeChromium` passed (a LocalAPI that resolved a different owner on the second call stopped the session before the fake launcher wrote its launch marker, and the lock was then free). Code inspection: `serve` in internal/session/daemon.go runs `checkProfileOwner` before any `BrowserLauncher` call. Limitation: fake LocalAPI and fake launcher; no real tailnet.

CRITERION: AC-07 Invalid profile names are refused before any file is touched, and a profile last opened by a newer Chromium major version is refused before launch.
VERDICT: met
EVIDENCE: `go test -race -count=1 ./...` at 739c0fb: `TestProfileNames` passed (`..`, `a/b`, `Work`, `-a`, 41 characters, empty, `a_b` and `../x` refused with `invalid-profile-name` for `start --profile` and `profile delete`, and the state base stayed empty); `TestProfileStartRefusesRunningBrowserAndNewerChromium` passed (meta.json with major 999 gave `profile-chromium-newer` with no record or guard); `TestChromiumVersion` passed. Limitation: version refusal uses a scripted `--version` stand-in.

CRITERION: AC-08 The profile store's own paths are private to the runtime's OS account and not followed through symlinks, and the README states that a reusable profile is protected only by file permissions and the host account boundary.
VERDICT: met
EVIDENCE: `go test -race -count=1 ./...` at 739c0fb: `TestStorePathsArePrivate` (0700 root, profile directory and `chromium/`, 0600 `.lock` and `meta.json`) and `TestStoreRefusesSymlinksAndWideModes` (each of root, profile, meta.json, .lock and chromium replaced by a symlink is refused, and a 0755 profile directory is refused) passed. I read plugins/remote-gui/README.md "Protection at rest": "A reusable profile is protected only by file permissions and the host account boundary". Limitation: none beyond the unit scope.

CRITERION: AC-09 A download in a later session lands in that session's own download directory, and preferences Chromium saved in the profile survive across sessions.
VERDICT: met
EVIDENCE: `TestRealReusableProfileAcrossSessions/stop` at 739c0fb passed in the isolated rerun with Chromium 151: `fixture.txt` landed in session two's own `downloads`, and `bookmark_bar.show_on_all_tabs` written after session one was still present after session two's launch. `TestPreferencesMerge` and `TestReusableProfileLaunchPreparation` passed in the unit run. Limitation: one download and one preference key observed.

CRITERION: AC-10 `profile list` shows each profile with its owner, transport kind, times and holder, `profile delete` removes an idle profile completely and refuses one held by a session or used by a running Chromium, and `status` and `access` name a session's profile.
VERDICT: met
EVIDENCE: At 739c0fb, `TestProfileCommands` (CLI JSON fields for idle and in-use profiles with `holder_session` and `owner_login`, delete refused while locked and while a listening singleton socket exists, idle delete, repeated delete `missing`, `profile` in `status` and `access`), `TestProfileListAndDelete` and `TestLockRechecksReplacedFile` passed. `TestRealReusableProfileDeleteWhileBrowserRuns` passed in the gated run: with real Chromium outliving its killed guard and supervisor, delete failed with `profile-browser-still-running` naming the session and left the files and browser alone, then deleted the profile completely after `cleanup`. `profile.e2e.test.ts` listed, refused and deleted real profiles. Limitation: none observed.

CRITERION: AC-11 Credential entry on a reusable profile happens only in human mode. A session with `--profile` starts in human mode unless `--agent-start-approved` is given, the skill gives the agent control only after a confirmed handoff or on the owner's explicit approval in the current task, and the agent opens only a profile the owner named and never reads profile files directly.
VERDICT: met
EVIDENCE: At 739c0fb, `TestMisplacedProfileOptions`, `TestProfileAgentStartNeedsApproval`, `TestProfileStartDefaultsToHumanAndReleasesBeforeStopped` and `TestProfileCommands` passed (human default, `profile-requires-human-start`, `agent_start_approved` on the record and not the profile, misplaced flag refused). I read the SKILL.md "Reusable profiles" section against the design. `REMOTE_GUI_ROUTING_E2E=1 REMOTE_GUI_ROUTING_CASES=profile-named,profile-unnamed,profile-unapproved,profile-approved,profile-challenge bun test tests/remote-gui/native-routing.e2e.test.ts` with Copilot CLI 1.0.108 passed 5 of 5 in one run. Limitations: model replies are nondeterministic and this was one run; my first attempt failed in all cases only because my TMPDIR made the fixture's `api.sock` path 120 characters, past the Unix socket limit, so `doctor` saw Tailscale unavailable. The fixture uses a failing display and a synthetic session, so no real sign-in or handoff is graded.

CRITERION: AC-12 auth-refresh files stay unread and unchanged by every profile command, and the default profile store lies outside auth-refresh's default directories.
VERDICT: met
EVIDENCE: `REMOTE_GUI_BROWSER_E2E=1 REMOTE_GUI_TEST_BINARY=<fresh build> bun test tests/remote-gui/profile.e2e.test.ts` at 739c0fb passed in 35 s: sentinels in a temporary `~/.config/auth-refresh` and `~/.local/share/auth-refresh` kept hash, atime and mtime across create, reuse, race, list and delete, and the default store lay outside both trees. I confirmed separately that reading a file on this host's /tmp tmpfs whose atime precedes its mtime updates the atime, so a read would be detected. `grep -rn auth-refresh` finds no reference in non-test Go sources. Limitation: temporary HOME only.

CRITERION: AC-13 The README and skill describe reusable profiles with the glossary terms, the opt-in flag, owner binding, locking, deletion, the at-rest protection, the provider expiry limitation, that only persistent sign-ins survive and the "stay signed in" advice, the recovery for `profile-browser-still-running`, that stop sends no keys and that a sign-in should be left about half a minute before stopping, the rule that agents never read profile files, and auth-refresh as the first route for sign-in.
VERDICT: met
EVIDENCE: I read the README and SKILL.md diff at 739c0fb against each listed item and the glossary, and found every item present. `bun test tests/remote-gui/package.test.ts` passed 10 tests. `bun test tests/vh-adlc` failed 141 of 1289 at 739c0fb and 141 at origin/main 07217be in a scratch clone, with an identical list of failing test names, so that suite gives no signal here. Limitation: the 141 count differs from the 139 in the document's evidence line; the identical failure set is what matters.

CRITERION: AC-14 The module's race tests, vet, pinned lint and tidy checks pass, and service shares, browser phases, owner access and `cleanup` keep their behavior for sessions without a profile.
VERDICT: met
EVIDENCE: In plugins/remote-gui at 739c0fb with GOTOOLCHAIN=local and Go 1.27.2: `go test -race -count=1 ./...` with the tool paths unset passed in all nine packages; `go vet ./...`, `go mod tidy -diff`, and golangci-lint v2.15.0 `config verify` and `run ./...` (0 issues) passed. `REMOTE_GUI_BROWSER_E2E=1 REMOTE_GUI_VIEWER_E2E=1 bun test tests/remote-gui` passed 16 with 29 gated skips and 0 failures. Limitations: Firefox, SSH and the non-profile routing cases were not run; the existing `TestChangedPrivateSocketPathIsPreserved` left one guard process after the unit run, which I killed by PID.

CRITERION: AC-15 With an overridden sessions root, `--profile` and the `profile` commands fail with `profile-home-required` unless a profile root override is given, and with one they use that root.
VERDICT: met
EVIDENCE: `go test -race -count=1 ./...` at 739c0fb: `TestOverriddenSessionsRootRequiresProfileHome` (`start --profile`, `profile list` and `profile delete` under `--home` and under `REMOTE_GUI_HOME` give `profile-home-required`; `--profile-home` and `REMOTE_GUI_PROFILE_HOME` set the root) and `TestProfileCommands` (CLI `profile list` with `--home` gives `profile-home-required`) passed, and the session and real-browser tests created their stores under `--profile-home`. Limitation: none observed.

CRITERION: AC-16 A reusable profile session stopped by `stop` or by expiry sends no key to Chromium, ends it with a terminate and, after two seconds, a kill if needed, whenever its browser stop starts before the guard's deadline, and otherwise through the guard's group stop; a persistent cookie set 30 seconds before the stop is present in the next session in every run, and the README advises waiting about half a minute after signing in; `stop` reports `stopped` only after the holder is cleared and the lock released, and the next session's first launch marks the previous exit `Normal`.
VERDICT: not met
EVIDENCE: At 739c0fb most parts hold: `TestReusableStopSendsNoKeyAndTerminatesThenKills`, both `TestReusableProfileStopAndExpiryWithStubbornBrowser` subtests and `TestDelayedSupervisorLeavesChromiumToTheGuard` passed (no key, SIGTERM first, kill about 2 s later, group stop when the supervisor is delayed past the deadline, holder cleared, `exit_type` reset to `Normal`); `TestRealReusableProfileStopSendsNoKeys` passed with no key or submit from page or popup; `TestRealReusableProfileCookieSetBeforeStop` passed 10 of 10; the README has the half-minute advice. The two-second clause fails when the browser stop starts less than two seconds before the guard's deadline. I ran a scratch copy of the module using the test's own stand-in launcher with `REMOTE_GUI_TEST_STOP_DELAY` and a stubborn browser on a 4 s TTL. The browser stop sent SIGTERM at 4.61, 4.61 and 4.81 s after expiry, the guard's group SIGTERM followed at about 5.07 s, and the browser died 1.60, 1.54 and 1.23 s after the first terminate. At a 3.5 s delay it died 2.54 s after it. Limitation: a stand-in that ignores SIGTERM; real Chromium exited within 0.2 s of SIGTERM in R-9's measurements, so the early kill rarely matters in practice.

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria (AC-16), Design (Lifecycle)
EVIDENCE: The guard SIGKILLs the supervisor 5 s after its SIGTERM (`guard` in plugins/remote-gui/internal/session/daemon.go), which interrupts `closeReusable` in plugins/remote-gui/internal/browser/browser.go during its two-second wait, and `stopMembers` then terminates and kills Chromium; in the probe the browser died about 1 s after the group SIGTERM. A scratch probe with the stand-in launcher delayed 4.6 s and 4.8 s showed a kill 1.23 to 1.60 s after the first terminate, with no key sent. A browser stop can start this late, because `removeForward` runs first in the supervisor's deferred shutdown and can take up to 6 s. R-10 F-02 predicted this, and the AC-16 text was kept unchanged.
PROPOSAL: Restrict the two-second clause to a browser stop that starts at least two seconds before the guard's deadline, state that a later start ends through the group stop, and add that window to the stand-in tests. Otherwise the owner can record a residual for this sub-case.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Design (Commands, Single writer); `openProfile` in plugins/remote-gui/internal/session/profile.go
EVIDENCE: `remote-gui start --home <tmp>/s --profile-home <tmp>/p --profile fresh --transport loopback` with `REMOTE_GUI_CHROMIUM` pointing at a missing file returned `failed` with `chromium-version-unavailable` and created no record. `profile list` then showed `fresh` with `transport: loopback`. `openProfile` saves meta.json before the browser and version checks, so a refused first start creates the profile and binds it to the transport kind of that attempt. A later Tailscale start on that name then fails with `profile-owner-mismatch` until the owner deletes it.
PROPOSAL: Write a new profile's meta.json only after every refusal has passed, or remove a profile created by a refused start before releasing the lock.

FINDING: F-03
KIND: judgement
SEVERITY: nit
WHERE: Acceptance Criteria (AC-02)
EVIDENCE: AC-02 still promises that "A persistent cookie set in one `--profile` session is present in a later session" with no timing condition. Lifecycle says a cookie written up to about half a minute before the stop may be lost, and the passing tests wait 31 s. I marked AC-02 met under that design reading. R-10 F-01 raised this and the text was kept unchanged.
PROPOSAL: At the next normative revision, qualify AC-02 to a cookie set at least 30 seconds before the stop, matching AC-16.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Tasks (T9), plugins/remote-gui/internal/browser/browser_test.go
EVIDENCE: In the full `REMOTE_GUI_BROWSER_E2E=1 go test -race -count=1 ./internal/browser` run at 739c0fb (547 s), started while two `bun test tests/vh-adlc` suites ran on the host, `TestRealReusableProfileAcrossSessions/stop` failed at browser_test.go:738 with `session-start-timed-out; cleanup requested` for session two, and the existing `TestRealHumanBrowserHandoff` failed with `browser-close-needs-owner`. Both passed on an isolated rerun.
PROPOSAL: Note in tests/remote-gui/README.md or the test header that the gated browser package needs an otherwise idle host, or give the second start in the stop subtest more time.

### R-12

CRITERION: AC-01 Without `--profile`, browser sessions still start with a fresh profile that is deleted on stop and expiry, with unchanged command output and records.
VERDICT: met
EVIDENCE: At e71d1f3 in plugins/remote-gui, `go test -race -count=1 ./...` with the REMOTE_GUI_* tool paths unset passed in all nine packages, and `TestStartWithoutProfileKeepsRecordsAndOutput` passed three more times under `-race -count=3`. `REMOTE_GUI_BROWSER_E2E=1 go test -race -count=1 -v ./internal/browser` with runtime.env and Chromium 151.0.7922.137 passed in 508 s, including `TestRealHeadedBrowser`, `TestRealHumanBrowserHandoff` and all seven `TestBrowserComponentsCrashAndExpire` subtests (display, vnc, viewer-bridge, browser, supervisor, guard, expiry). Code inspection of the T18 change in `serve` (internal/session/daemon.go): the concurrent browser stop runs only when `r.Config.Profile != ""`; otherwise the deferred shutdown still runs `p.Revoke`, `removeForward`, `public.Close` and then the deferred `bundle.Stop`, as at 739c0fb. Limitations: the record and output check uses a fake browser launcher; the gated run started at load 6.05 while other sessions were busy, and still passed.

CRITERION: AC-02 A persistent cookie set in one `--profile` session is present in a later session on the same profile after the first session stopped. The first session's `downloads`, `Xauthority`, `vnc.passwd` and `control.sock` are gone and its stopped record remains.
VERDICT: met
EVIDENCE: In the gated `./internal/browser` run at e71d1f3, `TestRealReusableProfileAcrossSessions/stop` passed (40.72 s): `downloads`, `Xauthority`, `vnc.passwd` and `control.sock` were gone, `state.json` remained and session two saw `pers=1`. `REMOTE_GUI_BROWSER_E2E=1 REMOTE_GUI_TEST_BINARY=<scratch build of e71d1f3> bun test tests/remote-gui/profile.e2e.test.ts` passed in 36.22 s, carrying the cookie into a reused `t-reuse` under a temporary HOME. Limitation: both tests wait 31 s between setting the cookie and `stop`, as the design's half-minute caveat requires; R-11 F-03 on the untimed AC-02 wording still applies.

CRITERION: AC-03 A later session on a reused profile opens with only the connection page: tabs and session-only cookies from the previous session are absent after a `stop`, an expiry and a SIGKILL of the previous session, while handoffs within a session still keep tabs, session cookies and tab storage.
VERDICT: met
EVIDENCE: In the gated run at e71d1f3, `TestRealReusableProfileAcrossSessions` passed for `stop` (40.72 s), `expiry` (46.41 s) and `sigkill` (11.20 s): handoffs in session one kept the extra tab and `sess=1`, and session two after a handoff to agent showed only the connection page and no `sess` cookie. Tab storage across a handoff rests on R-11's executed scratch sessionStorage test at 739c0fb (2 of 2); internal/browser and the handoff path are unchanged since then (`git diff --stat 739c0fb e71d1f3` touches only internal/session), and the T18 change affects only shutdown. Limitation: Chromium 151 on Xvfb only.

CRITERION: AC-04 A second session cannot start on a profile while another live session holds it, gets `profile-in-use` naming the holder's session ID or `holder: starting`, and leaves no record or process behind, and `profile list` never causes a start to fail.
VERDICT: met
EVIDENCE: At e71d1f3, the full `go test -race -count=1 ./...` run passed `TestConcurrentProfileStarts` and `TestProfileStartDefaultsToHumanAndReleasesBeforeStopped`, and the latter passed three more times. `profile.e2e.test.ts` raced two real CLI starts on `t-race` and got one `profile-in-use` naming a holder. Code inspection of the T20 change in `openProfile`: the lock is still taken before the session record, and meta.json is now written after the browser and version checks but before the record and guard exist; `profile.List` lists a profile whose meta.json is missing without an error and takes no lock. Limitation: the unit race uses a fake browser launcher.

CRITERION: AC-05 After the supervisor and Chromium of a profile session are killed with SIGKILL, or when the leftover lock names another hostname, a new session on the same profile starts and works, while a profile whose Chromium is still running is refused with `profile-browser-still-running`, however that browser spelled the profile directory, leaving no record or process and naming the owning session and a recovery that works.
VERDICT: met
EVIDENCE: In the gated run at e71d1f3, `TestRealReusableProfileAcrossSessions/sigkill` passed (a new session started and its viewer worked after the SIGKILL), and `TestRealReusableProfileStillRunning` passed (hand-started Chromium through a relative path and a symlink refused with no record; after killing only guard and supervisor the refusal named the session, and repeated `cleanup` let a later start succeed). The unit run passed `TestSingletonCheckRecoversStaleLocks` (including a lock naming another hostname), `TestSingletonCheckRefusesALiveBrowser` and `TestProfileStartRefusesRunningBrowserAndNewerChromium`. The real other-hostname CLI probe rests on R-11 at 739c0fb; the singleton code is unchanged and T20 only moved meta.json after the check. Limitation: a start right after a SIGKILL is refused while Chromium helpers still hold the socket.

CRITERION: AC-06 A session whose resolved owner differs from the profile owner, or of a different transport kind, cannot open the profile, no record or process is created, and Chromium never launches on a profile whose owner the supervisor has not matched.
VERDICT: met
EVIDENCE: At e71d1f3 with the tool paths unset, `go test -race -count=3 ./internal/session -run ...` passed `TestProfileOwnerAndTransportBinding` (owner and transport mismatches give `profile-owner-mismatch` with no record or guard, against a status-only fake LocalAPI with no `--owner-login`), `TestSupervisorRechecksOwnerBeforeChromium` and `TestRefusedFirstStartLeavesNoProfile` (a refused Tailscale first start leaves no directory, and a later loopback start succeeds and binds loopback) three times each. I repeated R-11's F-02 command with a scratch CLI build: `start --profile fresh --transport loopback` with `REMOTE_GUI_CHROMIUM` missing returned `failed` with `chromium-version-unavailable`, and `profile list` then returned `"profiles":[]`, so no owner or transport was bound. Code inspection: `serve` still runs `checkProfileOwner` before any `BrowserLauncher` call. Limitation: fake LocalAPI and launcher; no real tailnet.

CRITERION: AC-07 Invalid profile names are refused before any file is touched, and a profile last opened by a newer Chromium major version is refused before launch.
VERDICT: met
EVIDENCE: At e71d1f3, `TestProfileNames` (internal/config), `TestChromiumVersion` (internal/profile) and `TestProfileStartRefusesRunningBrowserAndNewerChromium` (internal/session, three runs) passed: invalid names gave `invalid-profile-name`, and meta.json recording major 999 gave `profile-chromium-newer` with no record or guard. `TestRefusedFirstStartLeavesNoProfile` and my CLI repetition showed that a refused first start no longer leaves a profile behind. Limitation: the version refusal uses a scripted `--version` stand-in.

CRITERION: AC-08 The profile store's own paths are private to the runtime's OS account and not followed through symlinks, and the README states that a reusable profile is protected only by file permissions and the host account boundary.
VERDICT: met
EVIDENCE: At e71d1f3, `TestStorePathsArePrivate` and `TestStoreRefusesSymlinksAndWideModes` passed with `-race`. plugins/remote-gui/README.md line 103 reads "A reusable profile is protected only by file permissions and the host account boundary"; the README and internal/profile are unchanged since 739c0fb. Limitation: unit scope only.

CRITERION: AC-09 A download in a later session lands in that session's own download directory, and preferences Chromium saved in the profile survive across sessions.
VERDICT: met
EVIDENCE: In the gated run at e71d1f3, `TestRealReusableProfileAcrossSessions/stop` passed: `fixture.txt` landed in session two's own `downloads`, and the `bookmark_bar.show_on_all_tabs` value written after session one survived session two's launch. `TestPreferencesMerge` and `TestReusableProfileLaunchPreparation` passed in the unit run. Limitation: one download and one preference key.

CRITERION: AC-10 `profile list` shows each profile with its owner, transport kind, times and holder, `profile delete` removes an idle profile completely and refuses one held by a session or used by a running Chromium, and `status` and `access` name a session's profile.
VERDICT: met
EVIDENCE: At e71d1f3, the unit run passed `TestProfileCommands`, `TestProfileListAndDelete` and `TestLockRechecksReplacedFile`. In the gated run `TestRealReusableProfileDeleteWhileBrowserRuns` passed: with a real Chromium outliving its killed guard and supervisor, delete failed with `profile-browser-still-running`, then removed the profile completely after `cleanup`. `profile.e2e.test.ts` listed, refused and deleted real profiles. Limitation: none observed.

CRITERION: AC-11 Credential entry on a reusable profile happens only in human mode. A session with `--profile` starts in human mode unless `--agent-start-approved` is given, the skill gives the agent control only after a confirmed handoff or on the owner's explicit approval in the current task, and the agent opens only a profile the owner named and never reads profile files directly.
VERDICT: met
EVIDENCE: At e71d1f3, `TestMisplacedProfileOptions`, `TestProfileStartDefaultsToHumanAndReleasesBeforeStopped` and `TestProfileCommands` passed, along with the rest of the unit run (human default, `profile-requires-human-start`, `agent_start_approved` on the record, misplaced flag refused). The skill and the routing fixtures are unchanged since 739c0fb (`git diff --stat 739c0fb e71d1f3 -- plugins/remote-gui/skills tests/remote-gui` is empty), so the routing evidence rests on R-11's executed run (Copilot CLI 1.0.108, `profile-named`, `profile-unnamed`, `profile-unapproved`, `profile-approved` and `profile-challenge` passed 5 of 5). I did not rerun the model cases. Limitation: model replies are nondeterministic.

CRITERION: AC-12 auth-refresh files stay unread and unchanged by every profile command, and the default profile store lies outside auth-refresh's default directories.
VERDICT: met
EVIDENCE: `REMOTE_GUI_BROWSER_E2E=1 REMOTE_GUI_TEST_BINARY=<scratch build of e71d1f3> bun test tests/remote-gui/profile.e2e.test.ts` passed in 36.22 s: auth-refresh sentinels kept hash, atime and mtime across create, reuse, race, list and delete, and the default store lay outside both trees. `grep -rln auth-refresh --include=*.go` in plugins/remote-gui finds no non-test source. R-11 confirmed that a read on this host's /tmp updates an earlier atime. Limitation: temporary HOME only.

CRITERION: AC-13 The README and skill describe reusable profiles with the glossary terms, the opt-in flag, owner binding, locking, deletion, the at-rest protection, the provider expiry limitation, that only persistent sign-ins survive and the "stay signed in" advice, the recovery for `profile-browser-still-running`, that stop sends no keys and that a sign-in should be left about half a minute before stopping, the rule that agents never read profile files, and auth-refresh as the first route for sign-in.
VERDICT: met
EVIDENCE: The README and SKILL.md are unchanged since 739c0fb, where R-11 checked every listed item. I reread README "Stop sends no keys" (line 91: no key, SIGTERM then SIGKILL after two seconds, wait about half a minute after signing in), "Protection at rest" (line 103) and SKILL.md line 64 ("stay signed in" and the half-minute wait). `bun test tests/remote-gui/package.test.ts` passed 10 tests at e71d1f3. The `bun test tests/vh-adlc` comparison rests on R-11 (identical failing set with and without the branch). Limitation: I did not rerun tests/vh-adlc.

CRITERION: AC-14 The module's race tests, vet, pinned lint and tidy checks pass, and service shares, browser phases, owner access and `cleanup` keep their behavior for sessions without a profile.
VERDICT: met
EVIDENCE: In plugins/remote-gui at e71d1f3 with GOTOOLCHAIN=local and Go 1.27.2: `go test -race -count=1 ./...` with the tool paths unset passed in all nine packages; `go vet ./...`, `go mod tidy -diff`, and golangci-lint v2.15.0 `config verify` and `run ./...` (0 issues) passed. `REMOTE_GUI_BROWSER_E2E=1 REMOTE_GUI_VIEWER_E2E=1 bun test tests/remote-gui` with `REMOTE_GUI_PLAYWRIGHT_MODULE` and a scratch build passed 16 with 29 gated skips and 0 failures. The gated browser package passed, including the non-profile phase and crash tests, and the T18 branch is skipped for sessions without a profile. Limitations: Firefox, SSH and routing cases not run; `TestChangedPrivateSocketPathIsPreserved` again left one guard, which I killed by PID.

CRITERION: AC-15 With an overridden sessions root, `--profile` and the `profile` commands fail with `profile-home-required` unless a profile root override is given, and with one they use that root.
VERDICT: met
EVIDENCE: At e71d1f3, `TestOverriddenSessionsRootRequiresProfileHome` (internal/config) and `TestProfileCommands` (cmd/remote-gui) passed, and the session, gated and scratch CLI runs used stores under `--profile-home`. internal/config is unchanged since 739c0fb. Limitation: none observed.

CRITERION: AC-16 A reusable profile session stopped by `stop` or by expiry sends no key to Chromium, ends it with a terminate and, after two seconds, a kill if needed, whenever its browser stop starts before the guard's deadline, and otherwise through the guard's group stop; a persistent cookie set 30 seconds before the stop is present in the next session in every run, and the README advises waiting about half a minute after signing in; `stop` reports `stopped` only after the holder is cleared and the lock released, and the next session's first launch marks the previous exit `Normal`.
VERDICT: not met
EVIDENCE: At e71d1f3 the R-11 case is fixed. `TestProfileBrowserStopDoesNotWaitForForwardRemoval` passed three times under `-race` and fails against the 739c0fb daemon.go in a scratch copy (SIGTERM 3.97 s and 4.00 s late). In a scratch copy with the real `closeReusable` through the browser package's stand-in launcher and the state lock held 4 s or 6 s, the SIGTERM-ignoring stand-in got SIGTERM within 0.01 s of expiry or `stop` and died 2.00 s later from its own kill, with one SIGTERM and no keys, in 8 of 8 runs. The gated run passed `TestRealReusableProfileStopSendsNoKeys`, `TestRealReusableProfileCookieSetBeforeStop` (10 of 10) and the stand-in tests (`TestReusableStopSendsNoKeyAndTerminatesThenKills`, `TestReusableProfileStopAndExpiryWithStubbornBrowser`, `TestDelayedSupervisorLeavesChromiumToTheGuard`), which also showed the holder cleared and exit_type `Normal`. The README advice is present. The two-second clause still fails when expiry arrives while the supervisor is still starting and blocked on the shared state lock. I held the root `.lock` from the test process, as T17 does, from just after `Origin` was recorded until the supervisor's `ready` update timed out, with a TTL of 2.6 s or 2.8 s. The browser stop sent SIGTERM 4.22 to 4.42 s after expiry, the guard's group stop sent a second SIGTERM at about 5.1 s, and the stand-in died 1.60, 1.73, 1.80 and 1.83 s after the first terminate. Limitation: the window needs a few seconds of lock contention at startup and a session that has not reached `ready`; real Chromium exits within 0.2 s of SIGTERM. The same probe with `stop` in place of expiry kept 2.35 s, but only because this host's group stop took about 1 s.

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria (AC-16), Design (Lifecycle); `serve` in plugins/remote-gui/internal/session/daemon.go
EVIDENCE: T18 starts the browser stop right after `p.Revoke` in the deferred shutdown, so a delayed `removeForward` no longer delays it. In the startup steps of `serve`, however, the `update` calls after `BrowserLauncher` (record fields, `Origin`, `ready`) use `context.Background()` with a 7 s timeout, not the canceled `ctx`. A guard SIGTERM that arrives while one of them waits on the shared state lock therefore starts the browser stop only when that call returns. Scratch probe above: with expiry at a 2.6 to 2.8 s TTL and the lock held from outside, the browser stop started 4.22 to 4.42 s after expiry, and the guard's group stop killed the stand-in 1.60 to 1.83 s after its first terminate.
PROPOSAL: Start the browser stop as soon as the context is canceled at any point after launch, for example from a goroutine that watches `ctx`, or make the startup `update` calls honor `ctx`, and add this startup case to the stand-in tests. Alternatively, narrow AC-16's two-second clause in a normative revision, or let the owner record a residual for this startup case.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Tasks (T17); `TestProfileBrowserStopDoesNotWaitForForwardRemoval` in plugins/remote-gui/internal/session/profile_test.go
EVIDENCE: The test checks that viewer access is rejected only after it has seen the stand-in's first SIGTERM, so it would also pass if `p.Revoke` ran just after the browser stop began. The ordering holds by inspection: in `serve`, `p.Revoke()` runs synchronously before the goroutine that calls `bundle.Stop`. The stand-in close in this test is the session fake, not `closeReusable`; my scratch probe covered the real close.
PROPOSAL: Have the fake browser's close record whether the proxy already rejects an enrolled viewer when it begins, so the test asserts that access is rejected before the browser stop.

### R-13

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria (AC-02, AC-16), Test Plan (AC-02), Design (Lifecycle)
EVIDENCE: AC-02 promises cookie persistence without a timing condition, and its proof specifies setting a cookie followed by stop without a wait. Lifecycle accepts loss of recently written cookies. AC-16 promises persistence after 30 seconds "in every run", but its latest evidence at docs/specs/remote-gui-reusable-profiles.md:199 explicitly records failures after that wait under heavy host load. The implementation at plugins/remote-gui/internal/browser/browser.go:308-326 terminates Chromium without establishing that cookies have reached disk; the test at browser_test.go:906-932 waits a fixed 30 seconds.
PROPOSAL: Ask the owner to resolve the persistence guarantee against the recorded failures. If accepting best-effort persistence, qualify both criteria and their proof accordingly; otherwise retain the guarantee and require a design that establishes it without sending page input.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Lifecycle), Acceptance Criteria (AC-16), Test Plan (AC-16)
EVIDENCE: AC-16 requires a two-second terminate-to-kill interval whenever browser stop starts before the guard deadline. The guard still kills the supervisor after five seconds at plugins/remote-gui/internal/session/daemon.go:322-337, then finishProfile invokes stopMembers, which terminates remaining processes and kills them after about 300 ms at daemon.go:90-119. Starting browser stop less than two seconds before the deadline therefore does not provide the promised interval. The startup watcher at daemon.go:457-469 improves promptness but does not change that deadline. The proof row does not specify this partial-close case or the existing delayed-supervisor fallback test.
PROPOSAL: Qualify the two-second interval to a close with sufficient remaining budget and describe the interrupted-close fallback, or change the guard to preserve the interval. Add explicit proof for both an interrupted close and a supervisor that never begins browser stop.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design (Lifecycle and Compatibility), Test Plan (AC-03, AC-11, AC-14, AC-16)
EVIDENCE: Clipboard handoff clearing now runs before an agent launch at plugins/remote-gui/internal/browser/phase.go:213-220, and reusable stop closes the helper after closing Chromium at browser.go:254-259. The profile tests at browser_test.go:670-795 exercise handoffs without asserting clipboard clearing or panel operation. The clipboard fixture at browser_test.go:985-992 starts only disposable sessions, and the reusable-stop stand-in at lifecycle_test.go:410 has no clipboard helper. No proof row establishes these combined behaviors; AC-14 expressly limits its compatibility promise to sessions without a profile.
PROPOSAL: State that reusable profiles preserve the clipboard feature's clearing and privacy behavior. Extend existing fixtures to verify a profile session's human-to-agent clear, failed-clear refusal, helper shutdown ordering, and a working empty clipboard panel in the next session.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Context (Owner summary)
EVIDENCE: docs/specs/remote-gui-reusable-profiles.md:30 says validation has not run, describes implementation through T8, and says several criteria still need evidence. The document now records completed tasks through T22 and evidence beneath those criteria. It also records acceptance of R-10 at line 288, while the summary discusses acceptance of R-6. Most importantly, the summary omits the subsequently recorded failures of the 30-second cookie guarantee at line 199.
PROPOSAL: Refresh the summary to distinguish recorded validation from outstanding proof, identify R-10 as the accepted baseline, and explain the clipboard drift re-review. Include the unresolved cookie-persistence limitation and AC-16's unticked state.


### R-14

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Frontmatter, Acceptance Criteria, Context (Owner summary)
EVIDENCE: Commit a516543 changes Design, criteria and Test Plan, but docs/specs/remote-gui-reusable-profiles.md:2 remains in-progress. Fourteen criteria remain ticked with old evidence; even the reset AC-02 retains its previous evidence. The pinned feature-document standard requires a normative revision to move to draft and reset every criterion tick, evidence line and residual. The summary instead says only AC-02, AC-16 and AC-17 need evidence.
PROPOSAL: Move the revised document to draft and reset all criterion ticks and evidence, preserving checked tasks and historical review records. Correct the summary, then obtain review and acceptance before returning through planned to implementation.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design (Compatibility), Acceptance Criteria (AC-17), Test Plan
EVIDENCE: docs/specs/remote-gui-reusable-profiles.md:153 says "clipboard text never enters the profile store", while Lifecycle preserves site storage. An isolated bun --eval probe using tests/remote-gui/fixtures/clipboard-page.ts dispatched a synthetic paste event in real Chromium 156.0.8078.79, waited 16 seconds and closed the browser. The pasted sentinel was present in Default/Session Storage/000003.log. Clipboard transport was not exercised. The existing privacy sweep at tests/remote-gui/browser.e2e.test.ts:443-458 relies on deleting the disposable remote profile; AC-17 and T25 provide no retained-profile privacy check.
PROPOSAL: Scope the non-persistence promise to the viewer and clipboard helper, and explain that text pasted into a remote page can enter retained browser storage. Add focused retained-profile proof distinguishing automatic clipboard persistence from storage deliberately written by the page.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design (Lifecycle), Acceptance Criteria (AC-16, AC-17), Test Plan, Tasks (T24)
EVIDENCE: AC-16 permits the guard to finish an interrupted browser close, but AC-17 unconditionally requires the clipboard helper to close after the browser. browser.go:250-259 calls the helper's Close only after closeReusable returns. daemon.go:322-338 kills an overdue supervisor before finishProfile stops its remaining group members. In the permitted interrupted-close case, the supervisor's death closes the helper's connection while a SIGTERM-ignoring Chromium is still alive; the helper's Close call never runs.
PROPOSAL: Qualify helper shutdown ordering to a supervisor close that finishes before the deadline, and describe the guard fallback separately. Make T24 verify both normal ordering and interrupted teardown against those qualified requirements.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan (AC-02, AC-16), Tasks (T25)
EVIDENCE: AC-02 and AC-16 require the one-minute load average to stay below 4. Their proof rows and T25 record it only at the start and end. The ten-run cookie test at browser_test.go:906-932 includes ten 30-second waits, so both endpoint readings can be below 4 while intervening cookie runs exceed the accepted bound.
PROPOSAL: Record load throughout each cookie persistence window at a defined sampling interval and retain its maximum. Mark a run that crosses the bound as outside the guaranteed-condition proof, rather than claiming that endpoint readings establish the bound held.


### R-15

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design (Lifecycle), AC-17, Test Plan (AC-17), Tasks (T24)
EVIDENCE: docs/specs/remote-gui-reusable-profiles.md:137 says interrupted teardown ends the clipboard helper through the group stop, "with the X server after Chromium". The helper runs inside the supervisor (browser.go:435). On expiry, daemon.go:334-338 kills and waits for that supervisor before invoking finishProfile, so the helper's connection ends before the group stop. stopMembers at daemon.go:90-110 signals every remaining member without waiting for Chromium to exit before terminating Xvfb. AC-17, its proof row and T24 repeat the incorrect helper teardown mechanism.
PROPOSAL: Describe interrupted teardown as supervisor death closing the helper connection, followed by group cleanup with no browser-before-X-server ordering guarantee. Align AC-17 and T24 with those observable events, retaining ordered helper closure only for a completed supervisor close.


### R-16

NO FINDINGS


## Sources

- [S1] auth-refresh `README.md`, Configuration section, read from the local checkout at commit `711028c` (`/home/m/code/auth-refresh`): configuration lives in `~/.config/auth-refresh/` and runtime state, including lane browser profiles, in `~/.local/share/auth-refresh/`, overridable with `AUTH_REFRESH_CONFIG` and `AUTH_REFRESH_HOME`. The marketplace pins auth-refresh at a different commit (`docs/specs/remote-gui.md:39`); the paths are used only to place remote-gui's default store elsewhere.
- [Chromium Linux password storage](https://chromium.googlesource.com/chromium/src/+/main/docs/linux/password_storage.md): returned HTTP 503 during drafting and supports no claim here. The design avoids relying on the basic store's protection.
