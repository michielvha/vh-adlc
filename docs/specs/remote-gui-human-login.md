---
status: in-progress
status_description: "Owner approved publishing the claim and preparing a draft PR. Implementing browser phases and their regression checks."
branch: feat/remote-gui-human-login
issue: https://github.com/michielvha/vh-adlc/issues/60
goal: "A remote owner can complete provider authentication in a human-controlled browser before explicitly returning the same disposable session to the agent."
covers:
  - plugins/remote-gui/
  - tests/remote-gui/
  - docs/reference/marketplace.md
  - .agents/plugins/marketplace.json
  - .claude-plugin/marketplace.json
  - .github/workflows/ci.yml
---

# Plan for human sign-in in remote-gui

## Context

### Owner summary

The shared browser currently enters automation mode before the owner reaches a provider's sign-in page.
Google rejected the owner's Tailscale sign-in on 2026-11-09 with its insecure-browser message.
The owner requested a permanent change to the shared tool and agent instructions that also reaches other installations.

Add a human sign-in phase to the existing disposable browser session.
During that phase the owner uses the authenticated viewer, with browser automation and debugging disabled.
After the owner confirms completion, an explicit hand-back can enable agent control by relaunching only the session's owned browser process with its existing disposable profile.
The viewer URL and session deadline stay stable.
Agents select the human phase for authentication and verify the provider outcome separately from viewer connectivity.

Existing automated browser callers retain their current default.
Configured CLI and SSO refreshes continue through auth-refresh.
Provider challenges remain with the owner, and provider-native authentication is the recovery route when a provider still rejects the browser.
The implementation does not promise that every provider will accept every host.
The proposed checks cover launch arguments, process ownership, phase transitions and login-state continuity through local fixtures, followed by an owner-performed Google/Tailscale acceptance test.

The design passed independent review.
Browser-level and real noVNC fixtures now pass human/agent transitions with restored session-only cookies and tab storage.
The shared skill update and owner-performed Google/Tailscale acceptance remain outstanding.
On 2026-11-09, the owner selected human sign-in followed by explicit agent hand-back.
Native browser session restoration retains session cookies and tab storage inside the protected disposable profile until its existing expiry and cleanup.
This adds profile-local persistence of that state during the session.
An accepted, independently reviewed design authorizes its feature implementation through the existing vh-adlc gates.
The owner approved publishing the feature claim and tracking issue, and preparing a draft implementation PR.
Merge, release and installed-host rollout follow the final review.
Verification uses owned workstation sessions and leaves the Oracle compute instance outside the runtime target set.

### Observed defect

At source commit `837ebc49ba1f935e846ed96a222bc55aae5bfc37`, the browser launcher supplies `--enable-automation` and `--remote-debugging-port=0` for every browser session.
See `plugins/remote-gui/internal/browser/browser.go:394`.
The browser skill requires an initial CDP attachment and pauses input while the human authenticates, leaving the debugging-enabled browser in place.
See `plugins/remote-gui/skills/remote-gui/SKILL.md:47-50`.
The supervisor records that CDP address without a distinct human-control phase.
See `plugins/remote-gui/internal/session/daemon.go:412-423`.

On 2026-11-09, the owner's screenshot showed Google's rejection and the Chrome automation banner.
A read-only evaluation on the task-owned connection-marker page returned `navigator.webdriver === true` in that same browser.
Google documents that it may block software-controlled browsers, and MDN documents that either of the current launch flags enables Chrome's automation indicator. [S1], [S2]
These observations establish that the human was handed an automation-enabled browser during the rejected flow.
They do not isolate every signal behind Google's account-specific decision.

The earlier `ERR_NETWORK_CHANGED` page recovered after navigation, with Fedora container-interface and Tailscale DNS events observed nearby.
That observation remains separate from the provider rejection.
Checking a viewer canvas or the first Tailscale login form did not verify the subsequent Google sign-in flow.

## Scope

Add an explicit human browser phase, a controlled transition back to the agent and a reverse transition for later authentication challenges.
Update the canonical shared skill to select human control for authentication and to classify transport, page rendering and provider acceptance separately.
Include lifecycle, privacy, packaging and native-routing tests using disposable fixtures.
Document portable installation and version verification for supported Linux amd64 runtime hosts and remote viewers on other operating systems.

The existing owner-restricted Tailscale transport, native loopback option, expiry, cleanup and service-sharing contract remain authoritative.
Configured account lanes and credential storage remain owned by auth-refresh.
Provider challenge handling belongs to the human.
Account credentials, browser profiles and cookies remain in their existing protected boundaries.
Oracle lifecycle operations, new runtime-platform support, browser-fingerprint spoofing and automatic challenge solving are outside this feature.

## Design

### Browser phases and compatibility

| Term | Meaning |
| --- | --- |
| Human mode | The owner interacts with the headed browser through its authenticated viewer. Browser debugging and CDP are absent. Agent input is procedurally limited to the owned connection probe before the owner's turn. |
| Agent mode | The session exposes verified loopback CDP for the agent's authorized browser work. |
| Handoff | A serialized, supervisor-owned transition between human and agent modes, retaining the session's profile, restored tabs, viewer URL and expiry. |
| Transport ready | The owned browser, viewer and connection probe work. Provider authentication remains a separate observed result. |

Extend browser creation and doctor with `--browser-mode human|agent`.
The omitted option retains the existing agent mode for existing callers and stored sessions.
The shared skill explicitly selects human mode when authentication is required.
Keep phase information in the existing private session record and report it in secret-free status output.
Human mode exposes its viewer and marker information while omitting a CDP address.

Human-mode launch uses a fresh, sandboxed, headed browser with its session-owned profile and download directory.
Its launch contains neither automation nor remote-debugging switches.
The owner reaches the intended provider through the real browser UI.
Agent verification before handoff is limited to the owned connection page and viewer transport.
The verification mechanism must work through the existing VNC/viewer path and must establish harmless input delivery to the owned marker page without exposing browser-debugging control.
Provider passwords, challenge fields and authenticated page data are excluded from that probe.

Add `handoff <id> --browser-mode human|agent` as a session-specific control command.
The mode option is required for that command.
Reject service-sharing sessions, expired sessions and incompatible record versions before a transition.
The agent requests an agent-mode transition only after the owner's explicit completion confirmation.
A runtime flag or successful transport check is not proof of that confirmation.
When a later authentication challenge appears, the agent pauses and requests human mode again.

### Owned browser transitions

Route transitions through the existing session supervisor and private control endpoint.
Serialize each transition with the session's lifecycle operations.
Signal only the browser whose process identity and birth metadata match the current record.
Allow it to close cleanly before launching its replacement with the exact same session-owned disposable profile.
Configure native restore-last-session behavior in that disposable profile from its first launch, preserving session cookies and restoring the original tabs and their sessionStorage namespaces in both transition directions. [S4], [S5], [S6]
Restore the existing tabs rather than opening replacement copies of their URLs.
Keep the original connection-marker tab available through native restoration.
Use profile-local browser preferences and launch behavior; the workstation's other browser profiles and managed policies retain their existing settings.
Retain the viewer, authenticated display, marker, session ID, URL and original expiry.
Treat a browser still holding its profile lock as a failed transition.
Avoid a forced process termination during a phase transition because it can lose sign-in state.
Retry only after reconciling the observed phase and owned process identities.

Return the resulting phase and verified browser-control readiness after an agent-mode transition.
Make repeated requests for the current phase observationally idempotent.
Concurrent handoff, stop and expiry operations must leave one owned browser or an explicit recoverable failure state.
An uncertain or failed transition must not report successful agent control.
A restored browser is checked separately for the authorized provider's post-login state.
Sites whose login depends on nonrestorable in-memory state require human reauthentication or their supported native authentication flow.
The runtime reports mode and control readiness, while the agent reports provider acceptance only after observing it.
Fixtures must establish persistence for nonpersistent HttpOnly cookies and tab-scoped sessionStorage; a persistent-cookie-only test is insufficient.
The existing cleanup contract remains responsible for expiry and private-data deletion.

Reusing the same task-owned profile is an in-session lifecycle operation.
Importing an existing user profile, copying cookies between profiles and inspecting auth-refresh lanes remain outside the operation.
Keep CDP loopback-only during agent mode and preserve sandbox and logging protections.
Use existing configured dependencies without Fedora paths, account names or environment-specific wrapper scripts in the shared implementation.

### Shared agent routing and error handling

Update the installed remote-gui skill and package checks together.
Route configured CLI/SSO authentication through auth-refresh before creating a browser.
For a fresh browser authentication flow, select human mode and verify the owned marker, viewer assets, WebSocket and input delivery before sending the link.
Describe these as transport checks.
Wait for owner confirmation and inspect the authorized provider outcome after hand-back before claiming a successful login.

For `ERR_NETWORK_CHANGED`, allow at most two retries of an initial, side-effect-free navigation and require a rendered-page check.
Leave credential submission, MFA, payment and state-changing form retries with the owner or their owning workflow.
A provider insecure-browser or unsupported-client rejection stops automatic login retries.
Report the provider outcome and select its supported native authentication route or human-only operation.
Keep sign-in success, token/CLI identity success and authorization for subsequent provider mutations as separate facts.

### Package delivery and other hosts

The source artifact is the independently installed `plugins/remote-gui` plugin, including its canonical skill, Go module and offline build wrapper.
Both repository catalogs reference that directory.
See `.agents/plugins/marketplace.json:44-48` and `.claude-plugin/marketplace.json:32-34`.
The wrapper derives its compiled cache identity from the actual Go sources and module inputs.
See `plugins/remote-gui/scripts/remote-gui.sh:34-39`.
The existing `remote-gui` CI job builds and tests the module and installed package.
See `.github/workflows/ci.yml:89-112`.

Update the plugin's version through the repository's existing release conventions and document the version that contains the new mode.
Verify a clean installed copy's skill, command options and offline build on a fresh state root using configured dependency paths.
Exercise two isolated supported-host configurations, including system-style executable paths and environment overrides, plus the independently installed package.
An additional physical machine is a separate observed acceptance check when one is available.
Report package installation, agent skill selection, fixture behavior and actual provider acceptance separately.
Existing running sessions retain the executable and mode they started with until replaced or expired.

## Acceptance Criteria

- [ ] AC-01: Authentication handoffs selected by the shared agent workflow start in the glossary-defined human mode, with a sandboxed browser, no browser-debugging interface and verified viewer/connection-page input restricted to the owner after the initial connection probe.
- [ ] AC-02: After explicit owner confirmation, the same disposable session can transfer to verified agent control while retaining its sign-in state, viewer URL and expiry, and can return to human control for a later challenge.
- [ ] AC-03: Repeated, concurrent and failed handoffs, foreign process identities, profile-lock failures, stop and expiry preserve unrelated processes and leave a truthful, recoverable lifecycle state without duplicate browsers or private-state leaks.
- [ ] AC-04: The shared agent uses the glossary-defined phases and readiness meanings, distinguishes viewer readiness from provider acceptance, bounds initial-navigation retries and stops repeating rejected provider logins.
- [ ] AC-05: Existing agent-mode and service-sharing callers, old session records, owner-restricted transport, auth-refresh ownership and private cleanup retain their supported behavior.
- [ ] AC-06: The independently installed plugin exposes the reviewed runtime and instructions across isolated supported-host configurations, with documented version/update verification, and the owner completes Google/Tailscale sign-in in human mode followed by verified authorized access after hand-back.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Run parser, launch-argument, owned-marker and real VNC input tests against human mode. Inspect the real browser's owned process arguments and listening sockets to establish that no debugging endpoint exists. Keep provider sign-in screens outside recordings and traces. |
| AC-02 | Authenticate to a local fixture through the human viewer using a nonpersistent HttpOnly cookie and tab-scoped sessionStorage. Request hand-back after fixture-owner confirmation and verify authenticated page behavior and the original tab's state after native restoration. Repeat in the reverse direction through the viewer. Include multiple tabs, an unsupported in-memory-state fixture, a lost-login result, and stable URL/expiry checks. No cookie export or secret inspection. |
| AC-03 | Exercise duplicate and concurrent transitions, simulated PID reuse, profile-lock timeout, failed launch, disconnect, stop and expiry. Assert browser counts, process ownership, truthful result/state, retained repair evidence and final private-directory cleanup. |
| AC-04 | Run installed native-agent routing fixtures for authentication, plain page inspection, active auth-refresh challenges, transient navigation failure, provider rejection and false-positive first-login readiness. Require actual skill selection and ordered operations, and verify that credentials/forms are not automatically retried. |
| AC-05 | Run the module's race tests, vet, pinned lint and tidy checks, plus package tests and existing viewer/native-routing fixtures. Include legacy records and existing command outputs. Check unrelated Serve state and auth-refresh sentinels before/after. |
| AC-06 | Test clean plugin copies and offline source-cache rebuilds with fresh state roots under two supported dependency configurations. Run the existing build/check pipeline. Ask the owner to complete Google/Tailscale sign-in in the human phase, then verify the authorized post-login page after confirmed hand-back. Record any unavailable independent-machine or provider test explicitly. |

## Tasks

- [x] T1 `plugins/remote-gui/internal/config/config_test.go`, `plugins/remote-gui/internal/app/app_test.go` - add phase/command and legacy-default regressions, then observe failure because human mode and handoff are absent (AC-01, AC-05).
      Evidence: 2026-11-09, targeted `go test ./internal/config ./internal/app -run 'TestBrowserModesAndHandoff|TestHelpExplainsBrowserPhases' -count=1` failed on absent browser_mode, rejected mode options/command and missing help. The unchanged module race suite passed after retaining failed workstation scratch-storage/path attempts. Private logs retain the baseline and T1 failure. Manual documentation assessment identifies the skill and help updates in T8; no mechanical coverage check was run because AGENTS.md declares no roots.
- [x] T2 `plugins/remote-gui/internal/config/config.go`, `plugins/remote-gui/internal/app/app.go`, `plugins/remote-gui/internal/state/` - implement validated browser-mode inputs, required handoff mode, secret-free phase fields and legacy record defaults; pass the T1 checks (AC-01, AC-05).
      Evidence: 2026-11-09, `go test -p 4 -race ./...` passed all eight module packages with short, private project-filesystem scratch space after retaining the quota-failed attempt. Browser creation/doctor/handoff parse explicit phases, absent legacy modes resolve to agent mode, invalid stored browser modes fail closed, and help names the phase interface. Manual docs assessment keeps the full workflow description in T8.
- [x] T3 `plugins/remote-gui/internal/browser/browser_test.go`, `plugins/remote-gui/internal/browser/lifecycle_test.go`, `tests/remote-gui/browser.e2e.test.ts` - add owned-marker/VNC human-mode and native session-restoration fixtures, including session-only HttpOnly cookies and tab storage, then observe the unsupported-phase failures (AC-01, AC-02).
      Evidence: 2026-11-09, targeted browser tests failed to compile because browserArgs, MarkerURL and the handoff handle are absent. Added a real-browser phase test and a real noVNC fixture for a session-only HttpOnly cookie plus tab-scoped sessionStorage across both handoffs. The optional browser fixtures remain unexecuted until T4/T6 supply their runtime and supervisor paths. Manual docs impact is the phase and verification procedure scheduled for T8.
- [x] T4 `plugins/remote-gui/internal/browser/`, `plugins/remote-gui/internal/session/` - implement the owned human browser launch, connection probe, native tab restoration and bounded browser transition handle, then pass T3's browser-level checks with debugging absent during human mode; the full CLI/viewer fixture follows its T6 supervisor dependency (AC-01, AC-02).
      Evidence: 2026-11-09, the module race suite passed. `REMOTE_GUI_BROWSER_E2E=1 go test -race ./internal/browser -run '^TestRealHumanBrowserHandoff$' -count=1 -v` passed after two prior successful real-browser repetitions. Native human/agent/human transitions preserve the viewer and marker, repeated same-mode requests preserve the browser, and human process arguments omit debugging/automation. Earlier Exit-shortcut/rendering failures remain in private logs. Browser exit uses the owned existing RFB display and native Exit menu, preserving the profile on a blocked close. Full supervisor and session-cookie/tab-storage proof remains scheduled for T6/T9. Manual docs impact remains T8.
- [x] T5 `plugins/remote-gui/internal/session/`, `plugins/remote-gui/internal/browser/lifecycle_test.go`, `plugins/remote-gui/cmd/remote-gui/main_test.go` - add failing supervisor-control and lifecycle regressions for handoff, duplicate/concurrent requests, foreign identities, profile locks, lost state, stop and expiry (AC-02, AC-03, AC-05).
      Evidence: 2026-11-09, supervisor tests fail on absent browserControl and phase/marker status fields, while the CLI test fails on its unsupported lifecycle command. Cases cover idempotence, concurrent requests, failed/retried transitions, expired/changed bindings and stop during a transition. The existing browser layer separately passed new real profile-lock preservation and foreign-process rejection checks. Full sign-in continuity remains the T3 viewer fixture. Manual docs impact includes truthful phase failure/retry guidance in T8.
- [x] T6 `plugins/remote-gui/internal/session/`, `plugins/remote-gui/internal/state/state.go`, `plugins/remote-gui/internal/browser/phase.go`, `plugins/remote-gui/internal/browser/lifecycle_test.go`, `plugins/remote-gui/cmd/remote-gui/main.go`, `tests/remote-gui/browser.e2e.test.ts` - connect the handoff command to serialized supervisor transitions and truthful status, finalize failed-close recovery, then pass T5 and the full T3 CLI/viewer fixture without duplicate browsers or unrelated process/Serve changes (AC-02, AC-03, AC-05).
      Evidence: 2026-11-09, all eight module packages passed `go test -p 4 -race ./...`; pinned golangci-lint v2.15.0, vet and tidy passed. The real noVNC fixture passed owner input, nonpersistent HttpOnly-cookie and original-tab sessionStorage continuity across human/agent/human transitions, with stable URL/expiry and final profile cleanup. Additional observed failures and passing regressions cover stale omitted JSON fields, premature failed-close cleanup and loss of the recovery viewer. Fixture authentication proofs now use uncached requests. Supervisor cases pass duplicate/concurrent requests, changed ownership/records, stop-state conflicts and retries. Earlier failed artifacts remain private. Manual docs impact is the new status, recovery and phase guidance in T8.
- [ ] T7 `tests/remote-gui/`, `plugins/remote-gui/internal/config/config_test.go` - add installed-agent routing and packaging regressions for authentication phases, provider rejection, bounded initial navigation and legacy operations, then observe the current skill's failures (AC-04, AC-05, AC-06).
- [ ] T8 `plugins/remote-gui/skills/remote-gui/SKILL.md`, `plugins/remote-gui/README.md`, `plugins/remote-gui/.claude-plugin/plugin.json`, `docs/reference/marketplace.md`, `tests/remote-gui/README.md` - update canonical routing, phase definitions, supported-host setup and plugin version through the existing packaging path, then pass T7 (AC-04, AC-05, AC-06).
- [ ] T9 `docs/specs/remote-gui-human-login.md`, `tests/remote-gui/` - run required Go/Bun/lint/build checks, installed-package fixtures under both dependency configurations, owner Google/Tailscale sign-in and confirmed hand-back, then record actual results and any unavailable acceptance check (AC-01, AC-02, AC-03, AC-04, AC-05, AC-06).

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-09 | R-1 | spec | `c60bcd95744e13122b15b230b758e8ae4b7b9f78` | unknown | procedural | Blocking session-restoration gap and glossary clarification; model identity unattested. |
| 2026-11-09 | R-2 | spec | `4502d8d879e418e1e09e41b595ce345f463df808` | unknown | procedural | No findings; model identity unattested. |
| 2026-11-09 | R-2 | spec | `4502d8d879e418e1e09e41b595ce345f463df808` | n/a | n/a | accepted by owner |

### R-1

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: docs/specs/remote-gui-human-login.md, Owned browser transitions and AC-02 Test Plan
EVIDENCE: Lines 104-105 close and relaunch the browser with the same profile, while AC-02 promises retained sign-in state. The design specifies no native session or tab restoration. Existing profile preferences at plugins/remote-gui/internal/browser/browser.go:303 configure downloads and password storage only. MDN documents that session cookies end at browser shutdown unless restored by session restoration, and that sessionStorage belongs to a tab's page session. See https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie and https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage. A persistent-cookie fixture could pass while a provider using session-only or tab-scoped state loses authentication during hand-back.
PROPOSAL: Define native session/tab restoration for the owned browser transition and its supported-state limits. Require fixtures using nonpersistent HttpOnly cookies and tab-scoped sessionStorage in both transition directions, with truthful failure handling when a site's required state cannot be preserved.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: docs/specs/remote-gui-human-login.md, Browser phases and compatibility and AC-01
EVIDENCE: The feature introduces user-facing human mode, agent mode and handoff without glossary rows. The pinned conventions/feature-documents.md:156-157 requires introduced terms to appear in glossary rows and be held to them by a criterion. AC-01 promises no automation interface while Design retains a VNC path capable of programmatic input, so the intended distinction between disabled browser debugging and procedurally restricted viewer input needs an explicit definition.
PROPOSAL: Define the modes and handoff in glossary rows, distinguishing the absent browser-debugging interface from the retained viewer and its input restrictions. Bind the existing criteria and routing tests to those definitions.

### R-2

NO FINDINGS

## Sources

- [S1. Google supported browsers](https://support.google.com/accounts/answer/7675428?hl=en) documents software-controlled browsers among possible sign-in rejection reasons.
- [S2. Navigator webdriver](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/webdriver) documents Chrome automation flags and the port-zero debugging behavior.
- [S3. Chrome remote debugging security](https://developer.chrome.com/blog/remote-debugging-port) documents dedicated user-data directories for remote debugging.
- [S4. Chromium startup restoration](https://chromium.googlesource.com/chromium/src/+/HEAD/components/policy/resources/templates/policy_definitions/Startup/RestoreOnStartup.yaml) describes native last-session restoration and session-cookie retention.
- [S5. Session cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie) describes their shutdown and session-restoration behavior.
- [S6. Session storage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage) describes tab-scoped state and page-session lifetime.
