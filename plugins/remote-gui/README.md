# remote-gui

Share a task-local app through private Tailscale HTTPS, or give a human control of a fresh headed Chromium browser and resume automation in that same browser afterward. Tailscale access opens directly for the selected owner's identity, with no viewer password or enrollment step. Forms and inspection use the same browser handoff as login and MFA.

## Install and activate

Install `remote-gui` independently from the vhco-tools marketplace. For Claude Code:

```sh
claude plugin marketplace add michielvha/vh-adlc
claude plugin install remote-gui@vhco-tools
```

In Codex desktop, add `michielvha/vh-adlc` as a marketplace and select `remote-gui` under Personal. Start a new chat so the skill is discovered. Runtime users do not need vh-adlc.

Automatic remote links need a persistent instruction in the owner's normal agent startup instructions. With the owner's authorization, add this snippet in the startup instructions they select:

```text
The human uses this host remotely over Tailscale. Before sending a human-facing
local app or preview URL, load and follow the installed remote-gui skill and
provide its verified tailnet URL. Do this on the first link without a reminder.
Keep external URLs unchanged and internal CDP/auth callback URLs local. Use a
loopback route only for an explicitly established SSH tunnel. If forwarding or
required browser verification fails, report the blocker without a localhost fallback.
```

Installation makes the plugin discoverable. Activation establishes remote context for future chats. Native-agent scenarios and a browser on the other device establish actual behavior; package discovery alone does not.

## Existing host tools

The runtime supports Linux amd64 and the Go version declared in `go.mod`. The Bash helper builds the complete installed module in a private source-keyed cache with `GOTOOLCHAIN=local`, module downloads disabled and VCS stamping disabled. It works outside a Git checkout. If PATH selects an older Go launcher, set `REMOTE_GUI_GO` to the existing matching executable. Nothing is downloaded.

Service sharing needs no GUI tools. Tailscale mode needs an existing signed-in installation, tailnet HTTPS, conditional LocalAPI ETag/If-Match updates and authorization to manage Unix-backed Serve targets. `doctor` reads capabilities and the selected owner; it cannot prove write permission without a mutation. A missing owner or unsupported peer/Unix capability blocks startup. The tool never switches to an identity-trusting TCP backend.

If this host needs local operator setup, its administrator must authorize it separately. The plugin never runs sudo, changes the operator or enables Funnel automatically. Existing routes and unknown configuration fields are preserved with conditional updates; reset and whole-config restoration are forbidden.

Browser mode also needs existing Xvfb, xauth, x11vnc, websockify, Chromium with a working sandbox, and noVNC assets:

| Variable | Default |
| --- | --- |
| `REMOTE_GUI_XVFB` | `Xvfb` on PATH |
| `REMOTE_GUI_XAUTH` | `xauth` on PATH |
| `REMOTE_GUI_X11VNC` | `x11vnc` on PATH |
| `REMOTE_GUI_WEBSOCKIFY` | `websockify` on PATH |
| `REMOTE_GUI_CHROMIUM` | `chromium-browser` on PATH |
| `REMOTE_GUI_NOVNC` | `/usr/share/novnc` |
| `REMOTE_GUI_TAILSCALE_SOCKET` | `/run/tailscale/tailscaled.sock` |

Use distribution packages or verified existing user-cache installations. `doctor` reports missing-tool guidance. The runtime does not install packages or edit global MCP configuration. noVNC must include its `core` and `vendor` assets.

## Commands

From the installed plugin directory, run `bash scripts/remote-gui.sh` (abbreviated below as `remote-gui`). Output is JSON with schema version 1. Default lifetime is two hours, maximum eight hours.

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

Tailscale sessions pin one exact owner login at creation. The default is the active host profile's user. Use `--owner-login human@example.com` on `doctor`, `start` or `share` when trusted task context selects another account, or the host profile is tagged. A tagged or unavailable default identity requires this explicit value. Status/access cannot change the owner afterward. No wildcard or whole-tailnet fallback is accepted.

Tailscale access metadata reports `auth_mode: tailscale-identity`, the pinned `owner_login`, URL and `expires_at`. `access --reveal` includes the complete intended app query but never issues a Tailscale viewer code or enrollment deadline. Ordinary output omits app queries. The owner opens the direct URL on their connected Tailscale device; no username/password dialog or **Open session** step appears. A missing, tagged or different viewer identity receives HTTP 403.

Identity headers are trusted only on the session's private Unix socket from the exact daemon process pinned through kernel peer credentials and process-birth metadata. Caller-supplied identity headers on a TCP connection or from another Unix client grant no access. A daemon restart requires a new session. Tailscale authenticates the device's user identity, so processes on an allowed owner's device share that network authority; this is not a separate per-browser login.

`ready` attests host transport probes. The skill must check the intended app, assets, redirects, cookies, origin behavior and required WebSockets before advertising a usable link. A failed or unavailable required browser check reports `compatibility-blocked` and stops sharing while preserving the app. Apps needing script-readable cookies, their own Authorization/HTTP authentication, or workers remain unsupported. Server-managed app cookies use temporary per-share, per-client jars. Raw browser cookies, Tailscale identity headers and internal probe proofs never reach the app.

Service shares pin one unambiguous listener and its process birth identity. Each new upstream connection must also have an accepted socket owned by that process before request bytes are sent. A missing, changed or unverifiable connection blocks sharing. Servers that transfer accepted sockets to another process are unsupported by this identity check.

State defaults to `$XDG_STATE_HOME/remote-gui/sessions` or `~/.local/state/remote-gui/sessions`. `REMOTE_GUI_HOME` or `--home` selects a short absolute private directory. Directories use 0700 and files/sockets use 0600. `REMOTE_GUI_BUILD_CACHE` selects a private build cache. Stopping a browser deletes its temporary profile and downloads; stopping a service share preserves its app process, files and settings.

Syntax errors exit 2; operation failures exit 1. Missing status/access fails. Repeated stops exit 0; an unknown ID returns `state: missing`. States are starting, ready, stopping, stopped, failed and cleanup-pending. `diagnostic` preserves the primary failure; `cleanup_diagnostic` reports unresolved cleanup separately. Cleanup retains its record and denial listener when scoped removal fails. Changed mappings or socket paths remain untouched. Resolve the blocker and rerun cleanup.

## Viewer context and explicit SSH

Use a fresh isolated private viewer context for each session, with previous remote-gui private contexts closed. A new tab alone is insufficient. This shared-host version cannot repair an older tab or service worker that previously controlled the same origin. New workers are blocked. Chromium and Firefox flows are exercised by optional browser checks. Random marker entry is an acceptance-test procedure; the agent verifies its browser automatically during ordinary handoff.

SSH is an explicit optional transport, never a fallback for a Tailscale failure. For an owner-established tunnel, use `--transport loopback`, forward the same viewer port with `ssh -N -L <port>:127.0.0.1:<port> <host>`, and use the selected `127.0.0.1` browser origin. The plugin does not configure SSH.

Only loopback access uses username `viewer` and a one-time code from `access <id> --reveal`. Open **Open session** in a fresh private context and enter that code in the native browser authentication prompt. It is not a provider password. Enrollment expires after ten minutes or session expiry and redeems once; a new code invalidates its unredeemed predecessor. Later requests require both the native credential and non-bearer HttpOnly binding. Keep codes out of URLs, repositories, logs and traces.

## auth-refresh

Use auth-refresh for configured CLI/SSO identities. It retains ownership of accounts, credentials and browser lanes. Remote-gui never reads that state or copies cookies. An active challenge must finish or safely yield through its owning workflow before another challenge starts. Unknown-credential logins and non-login forms/inspection can use a fresh remote-gui browser. Sharing a browser never proves CLI authentication success or authorizes later provider actions.

Read the [skill](skills/remote-gui/SKILL.md) for capability checks, input pause and exact-session resume.
