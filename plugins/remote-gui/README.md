# remote-gui

Share a task-local app through private Tailscale HTTPS, or give a human temporary control of a fresh headed Chromium browser. The agent can then resume automation in that same browser through local CDP. Forms and inspection work through the same handoff as login and MFA.

## Install and activate

Install `remote-gui` independently from the vhco-tools marketplace. For Claude Code:

```sh
claude plugin marketplace add michielvha/vh-adlc
claude plugin install remote-gui@vhco-tools
```

In Codex desktop, add `michielvha/vh-adlc` as a marketplace and select `remote-gui` under Personal. Start a new chat so the skill is discovered. The runtime does not require vh-adlc.

Automatic remote links also need one persistent instruction in the owner's normal agent startup instructions. With the owner's authorization, add this snippet in the startup instructions they select:

```text
The human uses this host remotely over Tailscale. Before sending a human-facing
local app or preview URL, load and follow the installed remote-gui skill and
provide its verified tailnet URL. Do this on the first link without a reminder.
Keep external URLs unchanged and internal CDP/auth callback URLs local. Use a
loopback route only for an explicitly established SSH tunnel. If forwarding or
required browser verification fails, report the blocker without a localhost fallback.
```

Installation makes the plugin discoverable. This activation establishes remote context for future chats; neither establishes verified host coverage. Native agent and second-device acceptance evidence is still required before claiming that coverage.

## Existing host tools

The initial runtime supports Linux amd64. Install the Go version declared in `go.mod` through your normal setup process. The Bash helper builds the complete installed module into a private source-keyed user cache. It sets `GOTOOLCHAIN=local` and disables module downloads. It does not fetch a binary or packages. If your PATH selects an older Go launcher, set `REMOTE_GUI_GO` to the existing matching Go executable. A cached toolchain can be selected explicitly this way; the helper will not download it.

Service sharing requires no GUI tools. Tailscale mode needs an existing signed-in Tailscale installation, HTTPS enabled for the tailnet and permission to manage Serve through the local daemon. Conditional configuration updates with ETag/If-Match are required. The runtime preserves foreign mappings and unknown fields; unsupported daemons fail closed. `doctor` is read-only. A successful read cannot prove write permission or second-device ACL access.

Browser mode also requires Xvfb, xauth, x11vnc, websockify, Chromium with a working sandbox, and noVNC assets. Point to existing executables/assets with:

| Variable | Default |
| --- | --- |
| `REMOTE_GUI_XVFB` | `Xvfb` on PATH |
| `REMOTE_GUI_XAUTH` | `xauth` on PATH |
| `REMOTE_GUI_X11VNC` | `x11vnc` on PATH |
| `REMOTE_GUI_WEBSOCKIFY` | `websockify` on PATH |
| `REMOTE_GUI_CHROMIUM` | `chromium-browser` on PATH |
| `REMOTE_GUI_NOVNC` | `/usr/share/novnc` |
| `REMOTE_GUI_TAILSCALE_SOCKET` | `/run/tailscale/tailscaled.sock` |

Use your distribution's packages or verified existing user-cache installations. `doctor` gives missing-tool guidance. It does not install packages, run sudo, change the operator or enable Funnel. Unsupported startup/attachment capabilities are blockers. NoVNC must include its `core` and `vendor` assets; assets outside that directory are not served.

## Commands

From the installed plugin directory, use `bash scripts/remote-gui.sh` (abbreviated below as `remote-gui`). All lifecycle output is JSON with schema version 1. Default session lifetime is two hours, maximum eight hours.

```sh
remote-gui doctor --kind share --transport tailscale
remote-gui share http://127.0.0.1:3000/preview --ttl 2h
remote-gui doctor --kind browser --transport tailscale
remote-gui start --ttl 2h
remote-gui status
remote-gui status <session-id>
remote-gui access <session-id> --reveal
remote-gui stop <session-id>
remote-gui cleanup
```

Ordinary start/status/access output contains no access code and omits the app query. Only explicit `access --reveal` returns the one-time code, its `enrollment_expires_at` deadline and the complete intended URL. `expires_at` is the separate session deadline. The owner receives the code in task chat, opens the link in a fresh isolated private browser context, and selects **Open session**. In the browser authentication prompt, enter username `viewer` and the one-time code as the password. Never enter a provider password. The code expires for enrollment after ten minutes or at session expiry and is redeemable once. Authenticated requests require both the port-scoped native HTTP credential and a matching HttpOnly client-binding cookie; that cookie cannot authenticate by itself. Issuing another code invalidates an unredeemed predecessor. Never save it in a repository, URL, log or trace.

`ready` reports host transport checks. It does not claim application compatibility or access from another device. The skill must verify required app behavior through the authenticated share before advertising a usable link. A required check failure or unavailable browser verification reports `compatibility-blocked` and stops the share. Apps needing browser-script cookies, their own Authorization headers/HTTP authentication, or workers are unsupported; server-managed cookies use temporary per-share and per-client jars. Raw browser/proxy cookies never reach the app.

State defaults to `$XDG_STATE_HOME/remote-gui/sessions` or `~/.local/state/remote-gui/sessions`. Use `REMOTE_GUI_HOME` or `--home` for a short absolute private directory. It must fit a Linux Unix-socket path. Directories use 0700 and private files 0600. `REMOTE_GUI_BUILD_CACHE` selects a private build cache. Temporary browser profiles and downloads are deleted on stop and expiry. A service share never owns or stops the application.

Syntax errors exit 2; operation failures exit 1. A missing status/access fails. Repeated successful stops exit 0; stopping a missing ID returns `state: missing`. States are starting, ready, stopping, stopped, failed and cleanup-pending. A cleanup-pending record is retained until its owned resources can be reconciled. Resolve the reported condition and rerun cleanup. A changed foreign Serve mapping remains untouched.

For an owner-established SSH tunnel, choose `--transport loopback`. Given the returned local port, establish `ssh -N -L <viewer-port>:127.0.0.1:<host-port> <host>`, then use the selected forwarded address. This is explicit local transport, not a tailnet reachability claim. The tunnel's browser origin must match the session's returned loopback origin; forward the same local port and use `127.0.0.1` in the browser. The tool does not configure SSH.

Use a fresh isolated private browser context for every session, with previous remote-gui private contexts closed. A new tab in an existing private window is insufficient. Browsers share origin authority with old tabs and service workers, so an already controlled context is unsupported. The proxy blocks new workers with CSP, but cannot repair an already controlled browser context. Chromium and Firefox native-authentication flows are exercised by the optional browser tests. Unmanaged services on other ports can receive the non-bearer binding cookie, but do not receive the native HTTP credential; binding-only replay is rejected.

## auth-refresh

Use auth-refresh for configured CLI/SSO identities and its account-specific workflow. It retains ownership of credentials and browser lanes. Remote-gui never reads that state or copies login cookies. An active challenge must finish or be safely yielded by its owning workflow before a fresh browser challenge starts. Unknown-credential logins and non-login human interactions can use remote-gui. A shared-browser login alone does not prove CLI authentication success.

Read the [skill](skills/remote-gui/SKILL.md) for marker verification, input pause and exact-session resume.
