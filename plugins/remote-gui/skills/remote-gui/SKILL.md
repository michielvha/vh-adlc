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
2. Select the phase before opening a browser. Unknown-credential login, authentication and MFA require `doctor --kind browser --browser-mode human --transport tailscale`, then `start --browser-mode human --transport tailscale`. Ordinary non-login forms or inspection use `--browser-mode agent` on doctor/start. Legacy start defaults to agent. Verify installed help supports phases before using them. An old running supervisor keeps its original code until its session ends. Existing GUI tools are required. Never install dependencies, invoke sudo, change the operator, enable Funnel or edit global MCP configuration automatically.
3. Verify the owned viewer before inviting the human. Check its page, noVNC assets, WebSocket and canvas in a fresh isolated viewer context with recordings and input logging disabled. In human mode, require `state: ready`, `browser_mode: human` and absent `local_cdp`. Use the returned `marker_url` and its `/check` booleans to verify the connection page and harmless marker input through the viewer. Do not attach CDP in human mode. In agent mode, attach locally with Playwright `chromium.connectOverCDP`, find the returned marker in the default context and verify input there. Keep the connection tab open. A failed required viewer check follows the compatibility-blocked cleanup contract. Routine handoffs never require the human to type test markers.
4. Read `access <id>` for the owner-restricted URL and expiry. Give the human that direct link and the fresh-private-context instruction. `tailscale-identity` access issues no viewer code. In human mode, ask them to open the authorized provider in a new tab inside the shared browser. Pause navigation and input while they work. Transport metadata such as `host-transport-only` establishes viewer reachability only. Provider sign-in still needs confirmation and verification.
5. Only after the owner confirms sign-in is complete, run `handoff <id> --browser-mode agent`. Require ready agent status and its loopback CDP endpoint before attaching. Verify the original marker and the authorized provider result through the restored page. Native session restoration preserves tabs and session cookies in the same disposable profile. The viewer URL, owner and expiry stay fixed. Human browser login and successful transport checks grant no later provider-action permission. Verify CLI authentication separately through its owning workflow.
6. Before another credential/MFA challenge, run `handoff <id> --browser-mode human` and verify ready human status with no CDP. A `handoff-failed` record preserves the viewer/profile for recovery and reports the last completed phase. Keep input paused, inspect the diagnostic and retry only after the owner resolves a blocked browser close or profile lock. Never delete locks, force a competing launch or invite credential entry while the phase is unverified. A lost command response requires a fresh status read before retrying.
7. A provider rejection in a genuine human phase requires a provider-supported native authentication route or a human-only workflow. Report the observed boundary. Do not claim login, repeatedly relaunch the challenge or spoof browser identity. An owner still entering credentials has not handed control back. Browser recovery is limited to this session's owned processes and must never restart a host, VM or unrelated service.
8. Stop when finished or retain only within the agreed deadline. Default lifetime is two hours, maximum eight hours. Stop/expiry revokes access and deletes this session's temporary profile/downloads. Report cleanup failures accurately.

## Explicit loopback and cleanup

Only an owner-established SSH route uses native-code access. Check `auth_mode: native-code`, then use `access <id> --reveal` for its one-time code, `enrollment_expires_at` and full intended URL. In a fresh isolated viewer context, username `viewer` and the code authenticate through **Open session**. Automated verification may use `{username: "viewer", password: <code>, origin: <loopback-origin>}` in a newly created context. Deliver the code only in task chat; never put it in a URL, repository, trace or log. Never apply these steps to Tailscale identity mode.

Use secret-free `status [id]` and `cleanup` only for this tool's owned records. Repeated stops succeed; an unknown stop returns `missing`. Missing status/access fails. `cleanup-pending` retains the record; report its primary `diagnostic` and current `cleanup_diagnostic`, resolve the blocker and retry. Never reset Serve, restore an entire saved config, kill by executable name or delete another session's files. Changed socket paths and mappings survive cleanup.

Only a second-device browser establishes that device's ACL/network access. Report host probes, native-agent fixtures and human confirmation separately. Native catalog discovery alone proves no automatic host coverage.
