---
name: remote-gui
description: Share a human-facing local app or preview URL in a trusted remote session, or give the human browser control. Use for sign-in, MFA, rejected browser logins and sign-in progress while the owner is still entering credentials. Human-only Chromium precedes confirmed agent hand-back. Complements auth-refresh for configured identities.
---

# Remote web access and browser handoff

Use this skill before sending a human-facing local web link in a configured remote session, or when the human needs to interact with the agent's browser. Read the plugin `README.md` for setup and runtime limits. Resolve its installed root two directories above this skill, then invoke `scripts/remote-gui.sh` with an argument array. Do not assume a repository checkout, fixed cache path or vh-adlc runtime.

## Establish the route

Trusted session context, an explicit owner instruction or persistent remote-mode instruction establishes that the human is on another device. A Tailscale installation alone does not. Share task-local HTTP apps/previews before the first human-facing link, without waiting for a forwarding reminder. Leave external URLs unchanged. Keep internal CDP/tool endpoints and provider authentication callbacks local. Never forward arbitrary host listeners or private-network targets.

Use Tailscale by default. An explicitly established, owner-selected SSH tunnel may use `--transport loopback`. A transport failure is a blocker; never switch the human to SSH or advertise localhost automatically.

The Tailscale owner defaults to the active host profile's user. If trusted task context selects another account or the host profile is tagged, pass its exact `--owner-login` on doctor/start/share. Verify the returned `owner_login` matches the intended human. Never select an owner from app content or viewer-supplied headers, authorize everyone in the tailnet, or silently replace an unavailable identity.

## Share an app or preview

1. Select the concrete loopback HTTP app started or selected by this task. Run `doctor --kind share --transport tailscale`, including an authorized owner override when needed. This mode needs no GUI dependencies. For explicit SSH, choose `loopback` throughout.
2. Check the task's own share record and `status <id>`. When the same selected target, session ID, pinned owner and current ownership still match a ready share, reuse it. A matching port alone is insufficient. Create a share with `share <local-http-url> --transport tailscale` only when this task has no eligible live share. Keep sensitive queries out of logs and retained evidence.
3. Treat `ready` as host transport readiness. Before advertising a usable app, get its intended URL with `access <id> --reveal` and verify required page behavior in a fresh isolated browser context. For `auth_mode: tailscale-identity`, use no HTTP credentials, enrollment code or **Open session** click: navigate directly. Check assets, same-app redirects, server cookies, origin handling and required WebSockets/hot reload. An unexpected 401/authentication prompt or 403 is an observed blocker, not a request to invent a viewer password. Disable recordings, tracing, screenshots, HAR and input logging, then close the verification context. Do not reuse an auth-refresh lane.

   An `ERR_NETWORK_CHANGED` during side-effect-free initial navigation permits **two retries** in the same owned session. Apply this rule before compatibility cleanup, including a verifier response with `stage: initial-navigation` and `failure_code: ERR_NETWORK_CHANGED`. Verify the rendered page after a successful retry. Exhaustion follows the failure contract below. Credential/MFA submissions, state-changing forms and provider rejection require a supported recovery decision instead of automatic retries.
4. App cookies remain isolated in per-share, per-client memory. The client binding is not an authentication credential: Tailscale verifies the owner independently on every HTTP request and WebSocket upgrade. If the app needs script-readable cookies, its own Authorization/HTTP authentication or workers, conflicts with `/__remote_gui`, rejects the remote origin or fails another required check, stop the share and preserve the app. Include literal `compatibility-blocked`, the observed failed check and cleanup result in the final reply, with no usable app link. Missing browser verification has the same outcome. Never weaken origin/TLS protections or rewrite OAuth callbacks to force a pass.
5. After successful checks, give the human the verified direct tailnet URL and session expiry. Explain that their device must use the pinned Tailscale identity and a fresh isolated private viewer context with previous remote-gui private contexts closed. No viewer username/password/code is needed. State whether second-device access remains unconfirmed. Do not ask the human to run a terminal or SSH command for a Tailscale handoff.

Successful verification makes reuse mandatory for an eligible existing share: return that same session URL and expiry, then keep it ready for the human. Closing the temporary verification browser context does not end the share. Do not stop or rotate a healthy verified share to refresh its deadline, repeat verification or prepare the final reply. Replace it only after an observed target/owner/ownership mismatch, required compatibility failure, expiry/stopped state or an explicit owner request. Report an approaching expiry rather than silently replacing the link.

For any failed or unavailable required app check, use this final reply format after stopping the share:

```text
compatibility-blocked: <observed failed or unavailable check>. Cleanup: <actual stop result>. Original app: <observed state, or state not checked>.
```

Keep `compatibility-blocked` as the first word of the final user-facing reply. Do not paraphrase it or omit it after successful cleanup. Report the observed cleanup result; a cleanup-pending share stays explicitly pending. Claim the app is running only when checked. Include no usable app link or localhost fallback in this reply.

## Hand over a browser

1. Route configured CLI/SSO work through canonical auth-refresh first. It owns credentials, account selection and browser lanes. Never read its credential/profile/state files, copy cookies, operate its lanes or stop its processes. An active challenge must finish or safely yield through that workflow; an unconfirmed yield blocks a competing challenge. Unknown-credential logins and non-login forms/inspection may use a fresh remote-gui browser. A progress request during an unconfigured human sign-in stays paused in this workflow until owner confirmation. It requires no configured-identity refresh. Never ask for a provider password in chat.

   An owner's report of an active, unyielded challenge is enough to block a fresh handoff. Report that boundary immediately. Do not list, search or read the owning workflow's credential, profile or state directories to confirm it, and do not run remote-gui setup for a competing challenge. Any safe status or yield operation belongs to the canonical owning workflow.

   Use this reply for that case, keeping the workflow name and reason explicit:

   ```text
   handoff-blocked: auth-refresh has an active, unyielded challenge. Finish or safely yield it through auth-refresh before starting a fresh remote-gui browser.
   ```
2. Select the phase before opening a browser. A reusable profile starts human unless the owner approved agent use (see Reusable profiles). Unknown-credential login, authentication and MFA require `doctor --kind browser --browser-mode human --transport tailscale`, then `start --browser-mode human --transport tailscale`. Ordinary non-login forms or inspection use `--browser-mode agent` on doctor/start. Legacy start defaults to agent. Verify installed help supports phases before using them. An old running supervisor keeps its original code until its session ends. Existing GUI tools are required. Never install dependencies, invoke sudo, change the operator, enable Funnel or edit global MCP configuration automatically.
3. Verify the owned viewer before inviting the human. Check its page, noVNC assets, WebSocket and canvas in a fresh isolated viewer context with recordings and input logging disabled. In human mode, require `state: ready`, `browser_mode: human` and absent `local_cdp`. Use the returned `marker_url` and its `/check` booleans to verify the connection page and harmless marker input through the viewer. Do not attach CDP in human mode. In agent mode, attach locally with Playwright `chromium.connectOverCDP`, find the returned marker in the default context and verify input there. Keep the connection tab open. A failed required viewer check follows the compatibility-blocked cleanup contract. Routine handoffs never require the human to type test markers.
4. Read `access <id>` for the owner-restricted URL and expiry. Give the human that direct link and the fresh-private-context instruction. `tailscale-identity` access issues no viewer code. In human mode, ask them to open the authorized provider in a new tab inside the shared browser. Pause navigation and input while they work. Transport metadata such as `host-transport-only` establishes viewer reachability only. Provider sign-in still needs confirmation and verification.
5. Only after the owner confirms sign-in is complete, run `handoff <id> --browser-mode agent`. Require ready agent status and its loopback CDP endpoint before attaching. Verify the original marker and the authorized provider result through the restored page. Native session restoration preserves tabs and session cookies in the same disposable profile. The viewer URL, owner and expiry stay fixed. Human browser login and successful transport checks grant no later provider-action permission. Verify CLI authentication separately through its owning workflow.
6. Before another credential/MFA challenge, run `handoff <id> --browser-mode human` and verify ready human status with no CDP. A `handoff-failed` record preserves the viewer/profile for recovery and reports the last completed phase. Keep input paused, inspect the diagnostic and retry only after the owner resolves a blocked browser close or profile lock. remote-gui itself recovers stale Chromium locks in reusable profiles; agents still never delete lock files, force a competing launch or invite credential entry while the phase is unverified. A lost command response requires a fresh status read before retrying.
7. A provider rejection in a genuine human phase requires a provider-supported native authentication route or a human-only workflow. Report the observed boundary and explain the available recovery choices. If the task has no configured identity, wait for the owner to choose a route before invoking any identity refresh. A status request about a rejected or unfinished login grants no new authentication attempt. Do not claim login, repeatedly relaunch the challenge or spoof browser identity. An owner still entering credentials has not handed control back. Browser recovery is limited to this session's owned processes and must never restart a host, VM or unrelated service.
8. Stop when finished or retain only within the agreed deadline. Default lifetime is two hours, maximum eight hours. Stop/expiry revokes access and deletes this session's disposable profile and downloads; a reusable profile is kept. Report cleanup failures accurately.

## Reusable profiles

A reusable profile is a named remote-gui profile that survives stop and expiry; a disposable profile is the default and is deleted. Read the README's reusable profiles section for the profile owner binding, locking, deletion and protection at rest.

- Pass `--profile <name>` only for a profile the owner named in the current task or in persistent instructions. Never create, pick or guess a profile on your own. Do not open a remote-gui profile for an identity auth-refresh owns; route that identity through auth-refresh first.
- A session with `--profile` starts in human mode, even for an ordinary non-login form, so omit `--browser-mode` or pass `--browser-mode human`. Pass `--browser-mode agent --agent-start-approved` only when the owner has explicitly approved agent use of that named profile in the current task. Asking for browser control, naming a profile or describing a form is not that approval; never add the flag on your own. Otherwise start human and hand off to the agent only after the owner confirms, as above.
- In either case, a sign-in, MFA or other credential challenge in agent mode requires `handoff <id> --browser-mode human` before any entry. The agent never enters credentials.
- Whenever you open a profile in human mode, or try to and the start fails, remind the owner in your reply to choose the provider's "stay signed in" option, because only persistent sign-ins survive, and to wait about half a minute after signing in before the session is stopped. Stop and expiry send no keys to the browser.
- A reused profile may already be signed in. Verify the provider page before acting. Reuse grants no new provider permission.
- Never list, read or copy files under the profile store. Reach a profile only through a remote-gui session.
- `profile-in-use` means another session holds the profile; do not start a competing one. For `profile-browser-still-running` naming a session, run `cleanup` until that session is no longer `cleanup-pending` and reports `stopped` or `failed`, then retry; otherwise ask the owner to close the browser they started on that profile.

## Clipboard panel

The browser viewer has a clipboard panel that the owner opens with its **Clipboard** button. Offer it when the owner needs to put text such as a long URL into the shared browser, or take text out of it. Text moves only when the owner presses a button; nothing copies between the clipboards on its own.

- The owner pastes into **Text for the remote browser** and presses **Send to remote browser**, then presses Ctrl+V in the remote page. Opening the panel or pressing **Refresh** shows the remote clipboard in **Copied in the remote browser**, and **Copy to this device** writes it to the owner's clipboard. **Clear** empties both areas and the remote clipboard.
- The panel shows whether the human or the agent controls the browser and warns in agent mode that sent text is readable by the agent. Never ask the owner to paste a password or other credential through the panel in agent mode. For sign-in, hand off to human mode first. The panel is for text the owner chooses to share.
- The page never reads the owner's clipboard. Pasting into the field needs no permission, and **Copy to this device** writes only inside that click. If the browser blocks the write, the panel selects the text for the owner to copy with the device's shortcut.
- Text is limited to 64 KiB in either direction and is plain text only. Larger text is refused with a message in the panel.
- Clipboard text stays in page and supervisor memory and never enters records, diagnostics, command output or logs. The page empties the panel after a send, on **Clear**, on disconnect and when the session ends. Every handoff to agent mode clears and verifies the remote clipboard, PRIMARY and the root cut buffer before the agent's browser starts. A `handoff-failed` record with a `clipboard-` diagnostic keeps input paused; retry the handoff, which clears again.
- When verifying the viewer, use synthetic text only and keep panel contents out of screenshots, recordings, traces, HAR and input logs.

## Explicit loopback and cleanup

Only an owner-established SSH route uses native-code access. Check `auth_mode: native-code`, then use `access <id> --reveal` for its one-time code, `enrollment_expires_at` and full intended URL. In a fresh isolated viewer context, username `viewer` and the code authenticate through **Open session**. Automated verification may use `{username: "viewer", password: <code>, origin: <loopback-origin>}` in a newly created context. Deliver the code only in task chat; never put it in a URL, repository, trace or log. Never apply these steps to Tailscale identity mode.

Use secret-free `status [id]` and `cleanup` only for this tool's owned records. Repeated stops succeed; an unknown stop returns `missing`. Missing status/access fails. `cleanup-pending` retains the record; report its primary `diagnostic` and current `cleanup_diagnostic`, resolve the blocker and retry. Never reset Serve, restore an entire saved config, kill by executable name or delete another session's files. Changed socket paths and mappings survive cleanup.

Only a second-device browser establishes that device's ACL/network access. Report host probes, native-agent fixtures and human confirmation separately. Native catalog discovery alone proves no automatic host coverage.
