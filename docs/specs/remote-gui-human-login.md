---
status: in-progress
status_description: "Live owner sign-in passed. Independent review findings are repaired and await re-review before draft publication."
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
The shared skill now selects human sign-in and preserves the owner's pause.
The owner completed the live Tailscale sign-in and confirmed completion on 2026-11-09.
After hand-back, read-only verification found the restored authenticated Tailscale Machines page,
the original connection tab and the same viewer URL and expiry.
The first implementation review found duplicate connection tabs and an unmanaged CI tool pin.
Their repairs pass local regressions and await independent re-review.
Published CI remains pending.
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

- [x] AC-01: Authentication handoffs selected by the shared agent workflow start in the glossary-defined human mode, with a sandboxed browser, no browser-debugging interface and verified viewer/connection-page input restricted to the owner after the initial connection probe.
      Evidence: 2026-11-09, real browser/race and noVNC fixtures pass. The installed native agent's doctor result selects human mode for unknown login. The live human session's process arguments omit automation/debugging, its main Chromium process owns zero TCP listeners, and its marker reports nonautomated, loaded and input-verified before the owner's turn. The owner then performed sign-in.
- [x] AC-02: After explicit owner confirmation, the same disposable session can transfer to verified agent control while retaining its sign-in state, viewer URL and expiry, and can return to human control for a later challenge.
      Evidence: 2026-11-09, the real noVNC fixture passes human/agent/human transitions with nonpersistent HttpOnly cookies, original-tab sessionStorage and multiple restored tabs. Native in-memory-only state is observed lost and a revoked login returns 401 while transport metadata remains host-only. The owner's live confirmed hand-back restored authenticated Tailscale admin access with the original marker, URL and expiry.
- [x] AC-03: Repeated, concurrent and failed handoffs, foreign process identities, profile-lock failures, stop and expiry preserve unrelated processes and leave a truthful, recoverable lifecycle state without duplicate browsers or private-state leaks.
      Evidence: 2026-11-09, module race tests pass all eight packages including real process-crash/expiry checks, duplicate/concurrent transitions, failed launch/retry, changed records, owned-process identity checks, profile-lock recovery and stop conflicts. The noVNC tests verify profile deletion. One installed-copy legacy cleanup assertion failed on its initial run; the retained rerun and PATH configuration pass. The failed artifact remains available for review.
- [x] AC-04: The shared agent uses the glossary-defined phases and readiness meanings, distinguishes viewer readiness from provider acceptance, bounds initial-navigation retries and stops repeating rejected provider logins.
      Evidence: 2026-11-09, real isolated Copilot CLI 1.0.107 runs pass phase selection, unconfirmed-owner pause, rejected-provider recovery and exactly two same-session navigation retries before rendered success or cleanup. An initial rejected-provider case exposed the synthetic owning interface ignoring null configured identity; the fixture now honors that state and the rejected/unfinished cases both pass. Canonical guidance also limits status requests to reporting choices until an owner selects a new route.
- [x] AC-05: Existing agent-mode and service-sharing callers, old session records, owner-restricted transport, auth-refresh ownership and private cleanup retain their supported behavior.
      Evidence: 2026-11-09, module race tests, vet, tidy and pinned golangci-lint v2.15.0 pass. Legacy noVNC and shared-service browser fixtures pass. Native first-link/reuse, unavailable browser/transport, configured-SSO and owned-challenge cases pass while preserving synthetic state and foreign mappings. Package checks pass 8 with optional suites explicitly skipped in that invocation. The repository's 1296 vh-adlc package tests and root Go tests/vet/tidy/lint pass. The optional SSH/native-code cross-browser cases were not all rerun.
- [x] AC-06: The independently installed plugin exposes the reviewed runtime and instructions across isolated supported-host configurations, with documented version/update verification, and the owner completes Google/Tailscale sign-in in human mode followed by verified authorized access after hand-back.
      Evidence: 2026-11-09, a clean source copy builds offline outside the repository, exposes both phases and handoff, and passes the two real browser fixtures with explicit executable overrides and PATH-discovered executables. noVNC assets remain explicitly configured in both local configurations. Both manifests declare 0.2.0 and the component README explains updates and old supervisors. The owner confirmed live sign-in; subsequent CDP verification observed the restored authenticated Tailscale Machines page. No separate physical host was available. Ubuntu CI and marketplace publication remain pending.

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
- [x] T7 `tests/remote-gui/` - add installed-agent routing and packaging regressions for authentication phases, provider rejection, bounded initial navigation and legacy operations, then observe the current skill's failures (AC-04, AC-05, AC-06).
      Evidence: 2026-11-09, the new package checks fail on missing human-phase guidance and absent real-browser CI execution. A real isolated Copilot CLI 1.0.107 run loaded the installed skill and produced a doctor response with browser-mode-agent for unknown-login, failing the intended-phase check. Added provider-rejection, unconfirmed-owner and injected initial-navigation cases; their execution follows T8. The browser fixture records safe outcome fields only, and its writable build scratch stays inside the isolated root. Private receipts preserve the pre-change native result and failures. Manual docs impact is the canonical phase, retry and installation guidance in T8.
- [x] T8 `plugins/remote-gui/skills/remote-gui/SKILL.md`, `plugins/remote-gui/README.md`, `plugins/remote-gui/plugin.json`, `plugins/remote-gui/.claude-plugin/plugin.json`, `plugins/remote-gui/internal/browser/phase.go`, `.github/workflows/ci.yml`, `docs/reference/marketplace.md`, `tests/remote-gui/README.md`, `tests/remote-gui/fixtures/native-routing.ts` - update canonical routing, phase definitions, connection-page guidance, supported-host setup and plugin version through the existing packaging path; enable real-browser CI, correct contradictory fixture workflow metadata and pass T7 (AC-04, AC-05, AC-06).
      Evidence: 2026-11-09, all eight package checks pass. Installed Copilot CLI 1.0.107 selected human/agent modes for unknown-login/nonlogin, preserved rejected-provider and unconfirmed-owner boundaries, and made exactly two same-session initial-navigation retries before success or cleanup. The status-only failures exposed missing discovery guidance and contradictory synthetic owning-workflow metadata; both were corrected and passing reruns retained. Real Go browser race checks and both noVNC fixtures pass. Root/module pinned golangci-lint v2.15.0 reports zero issues; root Go tests, vet and tidy pass. CI now executes the real browser fixtures on Ubuntu; that runner execution remains pending publication. Both package manifests are 0.2.0. Manual documentation assessment updated the canonical skill, component README, marketplace reference and test instructions using the pinned humanize guide. No mechanical coverage check is claimed.
- [x] T9 `docs/specs/remote-gui-human-login.md`, `plugins/remote-gui/skills/remote-gui/SKILL.md`, `tests/remote-gui/` - finish missing tab-state/revoked-login fixtures and status-routing clarification, run required Go/Bun/lint/build checks and installed-package fixtures under both dependency configurations, then record owner sign-in/hand-back and unavailable checks (AC-01, AC-02, AC-03, AC-04, AC-05, AC-06).
      Evidence: 2026-11-09, root Go tests/vet/tidy and both modules' pinned lint pass; root Bun reports 1296 pass and zero fail. Real browser race, noVNC, service-sharing and installed-copy fixtures pass, with failed artifacts preserved. The 12-case native batch reports 11 pass and one synthetic owning-workflow failure, followed by a corrected two-case rejected/unfinished-login rerun with 2 pass. The owner completed live sign-in, then the candidate's hand-back preserved authenticated Tailscale admin access. Private receipts retain safe booleans and paths without cookies, provider credentials or policy contents. Manual documentation impact confirms the skill, component README and test guide describe the behavior. Ubuntu CI, an independent physical-machine check and installed-host rollout remain distinct pending observations.

- [x] T10 `plugins/remote-gui/internal/browser/`, `tests/remote-gui/browser.e2e.test.ts`, `tests/remote-gui/package.test.ts`, `tests/remote-gui/package.json`, `tests/remote-gui/bun.lock`, `.github/workflows/ci.yml`, `tests/remote-gui/README.md` - add failing exact-tab-count and managed-dependency regressions, fix R-3 findings F-01/F-02, then pass the real phase/restoration and frozen-package checks (AC-02, AC-05, AC-06).
      Evidence: 2026-11-09, new tab-count and missing-package assertions failed against the previous runtime/package. The repair opens the connection page on the first launch, activates its restored tab through owned agent CDP, and focuses it before returning to human mode so lazy restoration can load it. The reviewer's three-cycle probe now reports one tab and one marker after every round trip, followed by stopped cleanup. The real viewer/package run passes 11 tests with locked Playwright core, and installed-copy override/PATH runs each pass both viewer cases. Final module race, vet, tidy and pinned lint pass, including private retry-state preservation after a failed marker focus. Browser tests now wait boundedly for guarded cleanup to reach a terminal state and retain its diagnostic on failure. Frozen Bun installation verifies the generated integrity lock. The manifest is discoverable through standard Renovate package matching, while updater activation on this repository remains unverified. Manual docs impact updates the test setup and keeps component usage consistent. R-3 remains verbatim and a new exact-commit review is required.

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-09 | R-1 | spec | `c60bcd95744e13122b15b230b758e8ae4b7b9f78` | unknown | procedural | Blocking session-restoration gap and glossary clarification; model identity unattested. |
| 2026-11-09 | R-2 | spec | `4502d8d879e418e1e09e41b595ce345f463df808` | unknown | procedural | No findings; model identity unattested. |
| 2026-11-09 | R-2 | spec | `4502d8d879e418e1e09e41b595ce345f463df808` | n/a | n/a | accepted by owner |
| 2026-11-09 | R-3 | implementation | `f8761bda7810990c9ffe8375c925fe811c8738d2` | unknown | procedural | Criteria met with two should-fix findings for duplicate tabs and the CI tool pin. Model identity unattested. |

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

### R-3

CRITERION: AC-01 Authentication handoffs selected by the shared agent workflow start in the glossary-defined human mode, with a sandboxed browser, no browser-debugging interface and verified viewer/connection-page input restricted to the owner after the initial connection probe.
VERDICT: met
EVIDENCE: At f8761bda7810990c9ffe8375c925fe811c8738d2, independently executed the module's go test -race ./... with real GUI checks enabled and the real noVNC human-phase fixture. Both passed. Inspected browserArgs, validateBrowser, marker origin/generation checks and the canonical skill's owner-input pause. Human launches omit debugging/automation switches, expose no CDP metadata and accept the harmless marker through VNC. Inspected live-human-listeners.json, which records zero owned main-browser TCP listeners. Native unknown-login routing passed in the inspected retained execution log. Viewer input restriction after the probe is procedural.

CRITERION: AC-02 After explicit owner confirmation, the same disposable session can transfer to verified agent control while retaining its sign-in state, viewer URL and expiry, and can return to human control for a later challenge.
VERDICT: met
EVIDENCE: At f8761bda7810990c9ffe8375c925fe811c8738d2, independently executed browser.e2e.test.ts. Human/agent/human transitions retained nonpersistent HttpOnly authentication, original account-tab sessionStorage, additional tabs, viewer URL and expiry. JavaScript-only state was lost, and a revoked account returned 401 while readiness remained host-transport-only. Independently reran verify-provider.ts and observed the restored Tailscale /admin/machines page with admin heading/navigation, original marker and unchanged viewer/expiry. The parent supplied the preceding owner's explicit words "I am logged in" and the ordering before hand-back. I did not observe credential entry or each identity-provider step. F-01 records additional marker tabs introduced during restoration.

CRITERION: AC-03 Repeated, concurrent and failed handoffs, foreign process identities, profile-lock failures, stop and expiry preserve unrelated processes and leave a truthful, recoverable lifecycle state without duplicate browsers or private-state leaks.
VERDICT: met
EVIDENCE: At f8761bda7810990c9ffe8375c925fe811c8738d2, independently executed the module race suite with real browser lifecycle checks, all eight packages passed. Inspected duplicate/concurrent transitions, foreign identities, unsupported records, profile-lock retention, failed-transition recovery, stop conflicts, crash/expiry cleanup and owned-process signaling. The real noVNC cases deleted their profiles, and the repeated-phase probe ended stopped. Inspected the retained installed-copy failure "stopped browser profile survived" and its successful rerun. This review's browser/package run also passed. The failed run lacks the stop diagnostic needed to identify its cleanup cause, so its reliability anomaly remains recorded.

CRITERION: AC-04 The shared agent uses the glossary-defined phases and readiness meanings, distinguishes viewer readiness from provider acceptance, bounds initial-navigation retries and stops repeating rejected provider logins.
VERDICT: met
EVIDENCE: At f8761bda7810990c9ffe8375c925fe811c8738d2, inspected the installed skill, native fixture assertions and retained native execution logs. Unknown login and non-login cases selected human and agent phases, configured SSO delegated to the owning interface, unyielded challenges blocked competing setup, navigation cases bounded retries and verified rendered success or cleanup. Inspected the initial provider-rejected failure and the corrected fake owning-interface instruction honoring null configured identity. The final provider-rejected and unconfirmed-login rerun passed two cases. These are inspected execution artifacts, not a new native-model run by this reviewer. The independently executed revoked-login browser case confirmed that runtime readiness makes no provider-authentication claim.

CRITERION: AC-05 Existing agent-mode and service-sharing callers, old session records, owner-restricted transport, auth-refresh ownership and private cleanup retain their supported behavior.
VERDICT: met
EVIDENCE: At f8761bda7810990c9ffe8375c925fe811c8738d2, independently executed module race tests, vet, tidy -diff, golangci-lint v2.15.0 config verify/run and browser/package tests. All passed, lint reported zero issues with sandbox cache-write warnings. Inspected legacy-mode tests, service-sharing/owner-identity tests, private cleanup, auth-refresh sentinels and preserved foreign Serve mappings. Inspected t9-root-go.log and the complete t9-root-bun.log result of 1296 pass and zero fail. My separate restricted-sandbox root Bun attempt hit DNS/network failures and an unrelated timeout and was stopped, so it supplies no passing full-suite claim. Inspected Chromium/Firefox trusted-HTTPS identity fixture passes. Optional SSH coverage and published CI were not established by this review.

CRITERION: AC-06 The independently installed plugin exposes the reviewed runtime and instructions across isolated supported-host configurations, with documented version/update verification, and the owner completes Google/Tailscale sign-in in human mode followed by verified authorized access after hand-back.
VERDICT: met
EVIDENCE: At f8761bda7810990c9ffe8375c925fe811c8738d2, independently executed the clean-copy offline package build/help checks and inspected matching 0.2.0 manifests, canonical phase instructions, update guidance and retained installed-copy browser passes under executable overrides and PATH discovery. Those configurations share one physical host, with noVNC explicitly configured. Independently rendered the README Mermaid diagram successfully. The supplied original owner turn explicitly states "I am logged in" after the requested Tailscale flow and before hand-back. Independently reran the authorized provider verification and observed restored Tailscale admin access with unchanged session metadata. Credential entry and each Google identity-provider step were not observed. Marketplace publication, installed-host rollout and Ubuntu CI remain pending.

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: plugins/remote-gui/internal/browser/phase.go:36 and plugins/remote-gui/internal/browser/browser.go:468-478
EVIDENCE: At f8761bda7810990c9ffe8375c925fe811c8738d2, the isolated /tmp/remote-gui-review-tabs.ts probe started one human session and repeated agent/human transitions. Marker-tab counts after successive agent transitions were 3, 6 and 9. browserArgs appends the marker URL on every restored launch, and agent launch additionally creates another marker through /json/new before inspecting restored pages. Existing tests only require a matching marker to exist, so they pass despite this growth. The accepted Design requires restoration of existing tabs without opening replacement copies.
PROPOSAL: Open the marker only for a fresh browser session and reuse its restored tab during handoffs. Add a repeated human/agent regression requiring one marker and stable tab counts while retaining the account tab's state.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: .github/workflows/ci.yml:117
EVIDENCE: The new browser-verification setup installs playwright-core@1.64.1 through an inline npm command with no package manifest, lockfile or repository custom updater declaration for that pin. The pinned conventions/delivery.md requires every dependency to live in a supported discoverable manifest or an explicit custom manager and requires independently pinned download verification for executable tools. An inline version alone does not establish that delivery contract.
PROPOSAL: Declare the browser-test tool in a supported dependency manifest with its generated lockfile and install it frozen in CI. Keep its pin discoverable by the selected dependency updater and report updater adoption separately when it has not been verified.


## Sources

- [S1. Google supported browsers](https://support.google.com/accounts/answer/7675428?hl=en) documents software-controlled browsers among possible sign-in rejection reasons.
- [S2. Navigator webdriver](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/webdriver) documents Chrome automation flags and the port-zero debugging behavior.
- [S3. Chrome remote debugging security](https://developer.chrome.com/blog/remote-debugging-port) documents dedicated user-data directories for remote debugging.
- [S4. Chromium startup restoration](https://chromium.googlesource.com/chromium/src/+/HEAD/components/policy/resources/templates/policy_definitions/Startup/RestoreOnStartup.yaml) describes native last-session restoration and session-cookie retention.
- [S5. Session cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie) describes their shutdown and session-restoration behavior.
- [S6. Session storage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage) describes tab-scoped state and page-session lifetime.
- [S7. Chrome keyboard shortcuts](https://support.google.com/chrome/answer/2391819) documents the Linux native Exit menu sequence used by the owned viewer.
- [S8. Ubuntu runner image](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md) lists the preinstalled Google Chrome used by the real-browser CI job.
- [S9. Playwright CI](https://playwright.dev/docs/ci) describes browser and system-dependency setup for CI execution.
- [S10. Bun install](https://bun.sh/docs/pm/cli/install) documents frozen-lockfile installation and script controls.
- [S11. Renovate package matching](https://docs.renovatebot.com/modules/manager/npm/) documents package.json discovery and devDependency extraction. This supports manifest discoverability, while repository updater activation remains unverified.
