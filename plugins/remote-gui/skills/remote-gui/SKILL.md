---
name: remote-gui
description: Share a human-facing local app or preview URL automatically when trusted context says the human is remote, or hand a fresh headed Chromium browser to the human for login, MFA, forms or inspection and resume in that exact session. Complements auth-refresh for configured identities.
---

# Remote web access and browser handoff

Use this skill before sending a human-facing local web link in a configured remote session, or when the human needs to interact with the agent's browser. Read the plugin's `README.md` for setup and runtime limits. The plugin root is two directories above this skill directory; run its `scripts/remote-gui.sh` with an argument array. Resolve that installed location instead of assuming a repository checkout or fixed cache path. Runtime users do not need vh-adlc.

## Establish the route

Trusted session context, an explicit owner instruction or the persistent remote-mode instruction establishes that the human is on another device. A Tailscale installation alone does not. For that remote context, share task-local HTTP app/preview links before the first human-facing link, without waiting for a forwarding reminder. Leave known external URLs unchanged. Keep internal CDP/tool endpoints and provider authentication callbacks local. Never forward arbitrary host listeners or private-network targets.

If the human has explicitly established an SSH tunnel, use its selected route with `--transport loopback`. Otherwise use Tailscale. Do not present a host-local URL as reachable from another device. If transport or verification fails, report the observed blocker and omit an advertised usable app link.

## Share an app or preview

1. Select the concrete loopback HTTP app started or selected by this task. Run `doctor --kind share --transport tailscale`. For an explicit SSH tunnel, select `loopback` throughout. This mode needs no GUI dependencies.
2. Reuse only a live share from this task with the same selected target, session ID and current ownership. Use `status <id>` and the task's own record; matching a port alone is insufficient. Otherwise run `share <local-http-url> --transport tailscale`. Keep sensitive query values out of status, retained evidence and logs.
3. Treat `ready` as host transport readiness only. It does not attest app compatibility or another device's reachability. Before advertising a usable app, use an available browser through the authenticated share to check the intended page, required assets, same-app redirects, origin checks and required WebSockets, including hot reload when applicable. Use `access <id> --reveal` only for the intended owner; submit the code to `/__remote_gui/login` in a fresh browser context with tracing, screenshots, HAR and input logging disabled. Never put the code in a URL. Ordinary access/status output deliberately omits it.
4. Keep proxy authentication separate from the app's cookies. The proxy keeps server-managed app cookies in per-share, per-client memory. If the app needs script-readable cookies, conflicts with `/__remote_gui`, rejects the remote origin or fails another required browser check, report `compatibility-blocked`, run `stop <id>` and preserve the app. Missing browser verification capability has the same outcome. Do not disable origin protections, rewrite OAuth callbacks or advertise the failed share as usable. Configure only this task's app through documented public-origin options within existing authorization.
5. After successful app checks, issue a new one-time code with `access <id> --reveal` and send the owner the verified tailnet URL, that code and its deadline in the task chat. A new code invalidates the prior unredeemed code. State whether second-device access is still unconfirmed. Keep the live code out of repository files, status exports and third-party messages.

## Hand over a browser

1. For a configured CLI/SSO identity, route through the canonical auth-refresh workflow first. It owns credentials, account selection and browser lanes. Never read its credential/profile/state files, copy cookies, operate its lanes or stop its processes. If it owns an active challenge, require that workflow to finish or safely yield; an unconfirmed yield blocks a new challenge. This tool cannot migrate that session. Unknown-credential logins and non-login forms/inspection can use a fresh remote-gui browser. Never ask the human to disclose a password in chat.
2. Run `doctor --kind browser --transport tailscale`, then `start --transport tailscale`. All GUI tools must already exist. Never install dependencies, invoke sudo, change the Tailscale operator, enable Funnel or edit global MCP configuration to make it work.
3. Use the returned local CDP address with Playwright `chromium.connectOverCDP`. In the default context, find the page whose title equals the returned marker. Prove control with a harmless marker/input check before promising that automation can resume. If your browser tool cannot attach to this endpoint, stop the session and explain the missing capability. Never substitute a separate browser or import/export its profile.
4. Keep that marker page open. Navigate a separate page in the same default context to the task's intended page. Obtain `access <id> --reveal` and give the human the viewer URL, one-time code and expiry in task chat. They enter the code on the viewer's login form. Tailscale access needs no host terminal. Keep traces, recordings, page/input logging and automatic screenshots disabled.
5. Pause browser navigation and input while the human works. Wait for their confirmation. Then reattach to the same local CDP endpoint, check the original marker in the same default context, and resume only the authorized task. Human login does not prove a CLI identity was refreshed; verify through its provider workflow when relevant. A completed login grants no later provider-action permission.
6. Report expiry or cleanup failures. Run `stop <id>` when finished, or retain it only within its agreed deadline. The default is two hours; `--ttl` allows a positive duration up to eight hours. Stop/expiry deletes this session's temporary profile and downloads.

## Failures and cleanup

Use `status [id]` for secret-free health, `access <id>` for ordinary access metadata and `cleanup` to reconcile only this tool's owned records. Repeated stops succeed; stopping a missing ID reports `missing`. Missing status/access fails. If cleanup reports `cleanup-pending`, preserve the record and report the blocker; rerun cleanup after resolving it. Never reset Serve, restore a whole saved config, kill by executable name or delete another session's files.

Only a second-device browser can establish that device's ACL/network access. Report host probes and human confirmation separately. Never claim native-host automatic routing from catalog discovery or static skill checks alone; use recorded real-agent scenarios before claiming host coverage.
