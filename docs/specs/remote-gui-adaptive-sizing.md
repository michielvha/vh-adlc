---
status: in-progress
branch: feat/remote-gui-adaptive-sizing
status_description: "Claimed for test-first implementation in the owning managed worktree."
issue: null
goal: "The shared browser fills the active viewer at a readable size and adapts automatically when that viewer changes size."
covers:
  - plugins/remote-gui/
  - tests/remote-gui/
  - .github/workflows/ci.yml
---

# Plan: Adaptive remote-gui browser sizing

## Context

### Owner summary

The shared browser currently has a fixed landscape resolution. A taller viewer gets empty bands and small text. The requested outcome is a browser that fills the viewer and reflows when its window size or orientation changes.

The proposed implementation measures the space below the viewer toolbar in CSS pixels, resizes Chromium through native X11, and changes the framebuffer area exported by x11vnc. Xvfb has a bounded larger backing display. The streamed area contains the resized browser; web content reflows to its new dimensions. Resizing keeps the same processes, tabs, profile and viewer connection, including during human control, when browser debugging remains disabled.

On 2026-11-18, the owner selected automatic focus-based control, CSS pixels and the existing display tools. Focus claims take effect in the order the server accepts them: a delayed claim may temporarily take control until the intended viewer is refocused. The owner also selected proportional fitting at the last usable resolution for exceptional aspect ratios that cannot fit the supported bounds. A 4096 by 4096 backing display needs about 64 MiB for its main 32-bit framebuffer, plus other session memory. This is an estimate of the main buffer; total session memory is larger.

The work includes request validation, ordering concurrent updates, bounded dimensions, recovery when resizing fails, clipboard focus protection, browser tests and plugin documentation. Private transport, owner authorization and human/agent handoff rules remain in force. There are no host dependency installations or changes to existing sessions. New sessions receive the implementation after the plugin is updated. An older supervisor continues with its original fixed sizing.

Scratch probes established that the installed x11vnc can change its exported dimensions and Chromium accepts narrow native window sizes. Complete viewer behavior remains unverified. The first independent review found one blocking and four should-fix findings, preserved in R-1. The next review found one missing scenario for a newly opened normal Chromium window, preserved in R-2. R-3 independently reviewed the corrected specification with no findings. The owner accepted it on 2026-11-18 and authorized implementation, vh-adlc 0.26.0 for this run and documentation-only pushes to the default branch. The version check now reports matching installed and running versions. Planned verification covers real noVNC, Chromium and Firefox viewers, responsive geometry, input, concurrent viewers, failure recovery and both handoff directions. Acceptance after a clean independent spec review authorizes task planning and local implementation. Merge, release, installation and changes to live sessions require separate authority.

### Background

- At base `f5bd3a494c04b36c47461912848787df71bf89e6`, Xvfb starts at 1440 by 900 and Chromium starts at that window size (`plugins/remote-gui/internal/browser/browser.go:488`, `plugins/remote-gui/internal/browser/phase.go:31`). The viewer reserves a 32-pixel toolbar and enables proportional scaling (`plugins/remote-gui/internal/proxy/viewer.go:12-14`, `plugins/remote-gui/internal/proxy/viewer.go:123`).
- The session passes browser facilities into the authenticated proxy through `BrowserHandle` and `proxy.Options` (`plugins/remote-gui/internal/session/daemon.go:569`). The existing X11 helper can enumerate top-level windows without browser debugging (`plugins/remote-gui/internal/xclip/menus.go:18`).
- On 2026-11-18, a private Xvfb probe reported `minimum 1 x 1, current 1440 x 900, maximum 1440 x 900`. `xrandr --fb 900x1200` failed because the requested height exceeded that maximum. Enabling a noVNC resize setting alone does not establish a working backend.
- A second private probe started Xvfb at 4096 by 4096 and used `x11vnc -display <owned-display> -sync -remote clip:<width>x<height>+0+0`. Queries of `dpy_x,dpy_y,wdpy_x,wdpy_y` confirmed exported sizes 900 by 1200, 390 by 812 and 1600 by 868 while the backing display remained 4096 by 4096.
- A third probe used native `XMoveResizeWindow` on a disposable Chromium window. `XGetGeometry` confirmed 390 by 812, 320 by 536, 900 by 1200 and 1600 by 868 after the browser processed each change. All probes used synthetic state and removed their own processes and files. An initial sandboxed display probe and an interactive password-file invocation failed before these successful measurements; neither is viewer verification.
- The existing CI builds and checks the Go module, checks the independent package, then runs real browser fixtures (`.github/workflows/ci.yml:125-153`). The local source-keyed build helper includes every Go file in its cache identity (`plugins/remote-gui/scripts/remote-gui.sh:34-49`).

## Scope

Implement automatic browser-session sizing from the viewer's available area. Include the authenticated geometry route, native browser-window sizing, exported framebuffer sizing, viewer ownership and ordering, clipboard focus behavior, documentation and an independently installable plugin version increment.

App sharing keeps its current proxy behavior. Browser authentication, phase transitions, profile retention and expiry keep their existing contracts. Exclude provider login changes, fullscreen controls, viewer appearance redesign, host setup, new GUI dependencies, runtime installation and changes to an existing supervisor.

## Design

### Viewer geometry

Use the actual `#screen` content rectangle below the toolbar. Observe its dimensions with `ResizeObserver`; window focus, reconnect and visibility transitions also trigger a fresh measurement. A phone's visual viewport change must update the available height without moving focus away from a clipboard field. Measure integer CSS pixels, ignoring device pixel ratio. Use a trailing 150 ms debounce, at most one request in flight per viewer, and one replaceable pending measurement. Repeated unchanged measurements perform no geometry work. Reconnect and a new focus claim may resend unchanged dimensions to re-establish control.

The normal supported exported size is 320 by 240 through 4096 by 4096. For a larger viewer, scale both requested dimensions by the same factor to fit the maximum, preserving the viewer aspect ratio within integer rounding. If that calculation puts either dimension below its minimum, keep the last applied size and proportionally fit it; do not distort the image or send an unsupported size. For example, 320 by 8192 and 8192 by 240 use this fallback. A smaller or zero-size area also keeps the last applied size. These expected limits do not produce a backend-failure notice. Hidden viewers do not claim or resize. Retain noVNC proportional scaling while a request is pending, on another viewer, and on failure; adaptive sizing is automatic and adds no user toggle.

### Authenticated geometry requests and viewer control

Add a browser-only `POST /__remote_gui/viewport` route behind the existing session authentication, origin and upstream-ownership checks. App shares do not expose it. Require the exact same origin, `Sec-Fetch-Site: same-origin`, `Content-Type: application/json`, and `X-Remote-Gui-Viewport: 1`. Reject query parameters, duplicate security headers, unsupported methods, duplicate or unknown JSON fields, noninteger values and bodies over 1 KiB before invoking the backend. The response uses `Cache-Control: no-store`; it contains only numeric dimensions, a control result and fixed error codes. No CORS access is added.

Each loaded viewer creates a random per-page identifier in memory and sends a monotonically increasing safe-integer sequence. Neither is an authentication credential. The body carries `viewer_id`, `sequence`, `claim`, `width` and `height`. A focused visible viewer sends `claim: true` on connect or an actual focus transition. Later measurements send `claim: false`. The proxy serializes control decisions and application. Focus claims take precedence in server acceptance order, with no comparison between device clocks or physical focus-event times. A delayed cross-viewer claim accepted later becomes active even if its originating focus event happened earlier; refocusing the intended viewer issues a new claim. Only the active identifier's later measurements may change geometry. Record a validated request's sequence before backend work, including when the backend is busy. Duplicate or lower sequences never apply a change or reacquire control. A queued non-claim resize from an inactive viewer is refused, so it cannot undo a newer accepted claim. Responses distinguish `applied`, `unchanged`, `inactive` and fixed failure codes.

Keep a bounded table of at most 16 per-page sequence entries. Retain the active entry, expire inactive entries after 30 minutes, and refuse a new identifier while the table is full. Unknown identifiers must claim before sending measurements. On tab reload a new identifier makes a new claim. An inactive viewer gains control only on a new focus transition or reconnect while focused. Closing a viewer leaves the current size in place; another viewer's focus claim takes control without a disconnect dependency. The owner selected this server-order policy on 2026-11-18. The bound and sequence checks prevent unbounded memory and replay within retained entries; these identifiers provide no security beyond existing owner authentication.

### Native browser and framebuffer sizing

Reuse Xvfb, x11vnc and the existing authenticated X11 connection. Start a new browser session with a 4096 by 4096 backing display and an initial x11vnc clip of 1440 by 900 at origin zero. Chromium initially uses 1440 by 900. Add a typed viewport operation through `session.BrowserHandle` and `proxy.Options` to the browser runtime. Viewer requests never supply a display, PID, window identifier, executable, shell fragment or VNC control string.

The runtime validates dimensions independently and refreshes ownership of the recorded display, x11vnc and Chromium identities before mutation. Its geometry lock serializes resize, handoff and stop. It identifies the session Chromium's normal top-level windows through native X11 and process ownership, moves them to origin zero and sets their outer size. Extend the existing X11 helper; do not use CDP, browser-page evaluation or keystrokes for sizing in either phase. Publish the visible work area and constrain owned transient windows so menus and dialogs remain reachable within the streamed area. Never resize another session's window or an unowned X client.

Update x11vnc's exported clip using its existing executable, an argument array and this session's display/Xauthority environment. Only validated numeric geometry enters the control command. Bound each operation to two seconds and confirm the exported dimensions with an x11vnc query. Applying the full request succeeds only when the browser window geometry and exported area agree. A duplicate size may avoid X11 and subprocess work only while both geometries remain confirmed and the window set is unchanged. Native window creation/destruction or other observed geometry changes invalidate that confirmation. New owned normal windows adopt the current size, and new owned transient windows adopt the visible work area; normal page operations must not leave newly opened windows outside the streamed area. The larger backing display is an internal bound; visible geometry and normal page layout follow the applied browser window dimensions.

Remember the latest successfully applied size in supervisor memory. Handoff launches the replacement Chromium at that size, using the existing phase restoration procedure. During a transition the proxy may accept a focus claim and its sequence, but geometry work returns a fixed busy response without a partial change. A busy retry sends a higher sequence with `claim: false`, preserving only the latest dimensions; it never replays a focus claim. If another viewer has acquired control, the retry is inactive and stops. Otherwise retry after 500 ms, at most four times, then wait for a new focus, reconnect or geometry change. Suppress retries as soon as the page is hidden or loses focus. Stop cancels pending resize work and prevents any later mutation. Resize itself restarts neither Chromium nor the viewer connection and never changes the browser phase.

### Partial failure and compatibility

Validate the complete request before changing anything. Snapshot the prior window geometry and exported clip, resize the owned browser windows, then update and confirm the clip. Invalidate the geometry confirmation before the first mutating step. If either step fails, attempt bounded restoration of both previous geometries. Only successful checks of both window and clip may mark the restored geometry confirmed. A request returns success only after both checks pass. On restoration failure keep confirmation invalid, report a fixed failure code and let noVNC fit the framebuffer it actually receives. The remembered successful size remains a handoff preference and cannot justify an unchanged response. A subsequent eligible request, including that same remembered size after reconnect, must reconcile and confirm both geometries before returning success or clearing the notice. Keep the session and profile available and do not restart processes to recover a resize. Later focus, reconnect or a changed measurement permits a fresh attempt. Preserve ordinary clipboard focus and never log clipboard or page contents.

The toolbar reports `Automatic sizing unavailable; fitting the shared browser.` after a backend failure, while preserving connection state separately. A later confirmed size clears that notice. A busy transition does not show a permanent failure notice. Use an accessible status region that does not steal keyboard focus.

Existing supervisors and their records keep working without migration; the new size state is not persisted in records or reusable profiles. After an explicit plugin update, new sessions use the new implementation. Returning to the previous plugin affects new sessions only and restores fixed sizing. Do not stop or rotate an existing session to install or demonstrate this feature.

### Artifacts and delivery

The affected artifact is the independent `plugins/remote-gui` source package, discovered by the existing marketplace entries. Its source-keyed helper builds the Linux binary locally. Increment both plugin manifests together from 0.3.0 to 0.4.0 for this capability, and document sizing, limits, viewer control, fallback and the need for a new session. Keep the package independent of the vh-adlc runtime.

Validate the package through its existing helper from a temporary install-shaped copy, as well as building the Go module directly. Extend `tests/remote-gui` and the existing remote-gui CI job for the new browser scenarios. Record separate evidence for source checks, package behavior, independent review and any later release or installed behavior. This feature's current authorization does not merge, release or update the installed marketplace plugin.

### Terms

| Term | Meaning |
| --- | --- |
| Active viewer | The viewer whose focus or connection claim the server accepted most recently; device focus timestamps are not compared. |
| Available area | The viewer space below the toolbar, measured in CSS pixels. |
| Automatic sizing unavailable; fitting the shared browser. | Sizing failed; the viewer still proportionally fits the framebuffer it receives. |

## Acceptance Criteria

- [ ] AC-01: On initial connection and after window resizing or orientation changes, the browser fills the active viewer's available area at CSS-pixel dimensions within two pixels on each axis, throughout the supported size range, without stretched content or persistent empty bands.
- [ ] AC-02: A size change preserves the browser process, open tabs, fixture form values, viewer connection and exact-browser input in both human and agent phases, and human status continues to omit a CDP endpoint.
- [ ] AC-03: With two viewers, focus or connection claims take control in server acceptance order; inactive non-claim updates, duplicate or lower per-viewer sequences and busy retries cannot reacquire control. Hidden viewers send no new sizing requests, and viewer bookkeeping stays bounded.
- [ ] AC-04: Repeated or rapidly changing measurements converge on the latest eligible size with bounded work; unsupported sizes and backend failures retain a usable proportional view, show the defined failure notice when appropriate, and permit recovery on a later eligible event.
- [ ] AC-05: Geometry requests require the existing session owner and same-origin protections, accept only the bounded typed payload, and cannot mutate an app share, another browser session or an unowned window.
- [ ] AC-06: Handoff preserves the last applied size in both directions, concurrent handoff or stop cannot leave a successful partial resize, clipboard typing retains focus across size changes, and Chromium menus and fixture dialogs remain visible and usable.
- [ ] AC-07: The independently packaged plugin and both manifests agree on the new version, its documented sizing terms match the viewer, its verification runs through the existing CI path, and existing supervisors and records continue to work without migration.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Add `tests/remote-gui/viewport.e2e.test.ts` with a synthetic responsive page and real CLI/noVNC. Run Chromium and Firefox viewers at 320x568, 390x667, 390x844, 844x390, 768x1024, 1024x768, 900x1000, 1280x720 and 1440x900. Add real exported-boundary cases with a 32-pixel toolbar: viewer 320x272 yields 320x240, 4096x4128 yields 4096x4096, 4096x752 yields 4096x720 and 720x4128 yields 720x4096. Measure canvas CSS bounds, canvas framebuffer dimensions and browser outer X11 geometry; assert two-pixel agreement with the area below the viewer toolbar. Check the fixture content viewport separately below Chromium's tab strip and address bar: it must have the available browser content width/height, responsive reflow and usable controls, without requiring its height to equal the outer browser height. Assert no unintended horizontal overflow. Resize a connected page through portrait/landscape and back. Inspect synthetic screenshots at phone, reported tall-viewer and desktop sizes; retain initial failures separately. |
| AC-02 | In the real fixture, preserve synthetic tab URLs and form values while resizing in human mode, verify input through noVNC and marker checks, confirm human status has no CDP, then hand off and observe agent state. Repeat resizing in agent mode with unchanged browser PID/start identity and CDP URL. Track the noVNC WebSocket and assert no disconnect. Test-only agent CDP may observe fixture state; the resizing implementation must use native X11. |
| AC-03 | Proxy tests with a blocking fake backend submit focus claims, old in-flight non-claim updates, duplicate sequences and concurrent requests. Delay A's focus claim until after B's claim is accepted and assert A wins by server order; then deliver B's stale non-claim resize and assert it cannot change A's size. Make A busy, let B claim, and assert A's retry sends no claim and cannot take control back. Assert final dimensions and backend call order. Viewer tests hide or blur the page and assert no new measurements or retries are sent. Exercise 17 identifiers, expiry with an injected clock and reload. In the real two-viewer fixture, focus each viewer and verify the browser follows it while the other canvas scales; hide and close the active viewer, then focus the survivor. |
| AC-04 | Extend `viewer-page.e2e.test.ts` with controlled geometry routes and recorded calls: drive a resize burst, equal measurements, zero/small areas, a viewer above the maximum, 320x8224 and 8192x272 viewer rectangles whose proportional bounds are infeasible, a delayed response, disconnect/reconnect, 409 busy and exhausted retry. The infeasible rectangles keep the last usable dimensions, make no unsupported backend call and preserve aspect ratio. Also use a real viewer above the maximum to confirm proportional fitting and real exported dimensions. Assert one in-flight request, a replaceable pending value, the 150 ms debounce and bounded busy retries. Runtime tests inject X11/clip/query and restoration failures and check fixed responses and later recovery. Establish size A, partially apply B, fail restoration leaving mixed geometries, then reconnect requesting A: assert the backend rechecks and reconciles both geometries rather than returning unchanged. The failure notice clears only after that confirmation. Cover a fully confirmed rollback separately. Exercise high-DPI context with CSS sizing, reduced motion, clipboard-panel keyboard resizing and actual 200 percent browser zoom with its method/effective viewport recorded. Real noVNC failure fixture refuses one resize, keeps input working, then permits a changed size. |
| AC-05 | Extend Go proxy tests for unauthenticated and wrong-owner requests; missing/foreign/duplicate Origin and security headers; missing/foreign fetch-site; bad content type; methods; queries; oversized/malformed/unknown/duplicate JSON fields; unsafe sequences; noninteger/out-of-range dimensions; expired sessions; and app-share routing. Assert zero backend calls on refusal. Native X11 tests create owned and unrelated windows and confirm only eligible owned normal/transient windows change. After confirming a size, create and destroy owned normal windows and assert each event invalidates the duplicate shortcut; the next same-size request rechecks the current owned window set. Unrelated windows remain unchanged throughout. A second real session retains its geometry and input throughout the first session's resize. |
| AC-06 | Runtime tests interleave resize with both handoffs, stop and injected partial failure under `go test -race`; assert complete application or busy/failure, cancellation on stop and no later mutation. Real fixture uses both handoffs at a portrait size. With that size confirmed and the viewer rectangle unchanged, open a new normal Chromium window through noVNC, verify its native geometry adopts the current size without a new viewer measurement, and operate its visible controls through noVNC. Repeat in human and agent phases. Open a native Chromium menu and a synthetic page dialog near the viewport edge and verify controls remain reachable and usable through noVNC. Chromium/Firefox viewer cases type synthetic clipboard text while the keyboard/viewport resizes and assert focus and remote clipboard contracts. |
| AC-07 | Run module build, `go test -race ./...`, `go vet ./...`, golangci-lint v2.15.0 config/run, and `go mod tidy -diff`; `bun test tests/remote-gui`; and the opt-in real browser suite with both viewer engines. Package tests check both 0.4.0 manifests and build through `scripts/remote-gui.sh` in an install-shaped copy. Compatibility tests load an old record and exercise an old fixed-size supervisor independently of a new session. Check documentation against implemented labels/limits and CI inclusion. No installed or released behavior is claimed from these checks. |

## Tasks

- [x] T1 `plugins/remote-gui/internal/proxy/viewport*.go`, `internal/session/session.go`, `tests/remote-gui/viewport.e2e.test.ts` - watch the real viewer fail to adapt and proxy contract tests fail before implementing the typed route, request validation and bounded control ordering; proxy race tests pass (AC-01, AC-03, AC-05).
      Evidence: Missing viewport types first failed compilation; the isolated baseline noVNC fixture timed out waiting for 900x968 at a 900x1000 viewer (transcript /tmp/rg-adaptive-evidence/T1-baseline.log). New proxy tests then passed, followed by the module unit suite with GUI overrides excluded. Manual documentation review: the runtime does not expose the route yet; existing user docs remain accurate, and sizing guidance is scheduled in T6. The earlier broad run with GUI overrides failed the doctor missing-tools fixture; the normal environment passed it.
- [x] T2 `plugins/remote-gui/internal/xclip/viewport*.go` - observe native geometry tests fail, then implement owned normal/transient window sizing, work-area hints, snapshots and change detection; native X11 tests pass (AC-01, AC-05, AC-06).
      Evidence: Native viewport tests first failed to compile because Windows/Configure/Workarea did not exist. The complete internal/xclip suite then passed on the owned Xvfb fixture, including off-screen transient confinement, creation/destruction snapshots, clipboard checks and rejection of a separate X client forging the browser PID. X-Resource server PID attribution is required. Manual documentation review: these helpers are internal; runtime integration and user guidance remain in T3/T6.
- [ ] T3 `plugins/remote-gui/internal/browser/viewport*.go`, `browser.go`, `phase.go`, `internal/session/daemon.go` - observe transactional resize, failure/rollback, handoff and stop tests fail, then implement the bounded native/VNC operation and new-window reconciliation; browser race tests pass (AC-01, AC-02, AC-04, AC-06).
- [ ] T4 `plugins/remote-gui/internal/proxy/viewer.go`, `tests/remote-gui/viewer-page.e2e.test.ts` - observe viewer request/focus/retry tests fail, then implement debounced CSS geometry, focus claims, proportional fallback and accessible failure state; Chromium/Firefox viewer tests pass (AC-01, AC-03, AC-04, AC-06).
- [ ] T5 `tests/remote-gui/viewport.e2e.test.ts`, `fixtures/`, `README.md`, `.github/workflows/ci.yml` - extend the failing real viewer fixture through the accepted viewport matrix, input/state preservation, two viewers, handoffs, failures, new windows and menus; both browser engines and inspected synthetic captures establish the accepted proofs (AC-01, AC-02, AC-03, AC-04, AC-05, AC-06).
- [ ] T6 `plugins/remote-gui/plugin.json`, `.claude-plugin/plugin.json`, `README.md`, `skills/remote-gui/SKILL.md`, `tests/remote-gui/package.test.ts` - observe version/installation compatibility checks fail, update both manifests to 0.4.0 and document sizing, then run module/package checks and the install-shaped build; old record/supervisor compatibility passes (AC-07).

## Open Questions

None. The owner answered the viewer-control, pixel-density and backend questions, then confirmed server acceptance order and proportional fallback for infeasible aspect ratios on 2026-11-18.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-18 | R-1 | spec | `f34bca89edc788db96a301a2eccbf87c88d8fd33` | unknown | procedural | One blocking and four should-fix findings; model identity not attested. |
| 2026-11-18 | R-2 | spec | `68f5cb391fab4f5df710f10c525029930641ef6b` | unknown | procedural | One should-fix finding about new-window verification; model identity not attested. |
| 2026-11-18 | R-3 | spec | `4d7f8238ecabde6cd8693c5d16f3214f1fb142c6` | unknown | procedural | No findings; model identity not attested. |
| 2026-11-18 | R-3 | spec | `4d7f8238ecabde6cd8693c5d16f3214f1fb142c6` | n/a | n/a | accepted by owner |

### R-1

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Test Plan, AC-01 row (docs/specs/remote-gui-adaptive-sizing.md:105)
EVIDENCE: The row measures canvas CSS bounds, framebuffer dimensions, browser outer X11 geometry and the fixture content viewport, then requires two-pixel agreement with the available viewer area. Design: Native browser and framebuffer sizing explicitly resizes the browser's outer window. The existing launch arguments in plugins/remote-gui/internal/browser/phase.go:21-38 launch ordinary Chromium with browser chrome, rather than an app or kiosk window. Its page content viewport excludes the tab strip and address bar, so its height cannot also equal the outer window and framebuffer height within two pixels. This proof fails a correct implementation of the proposed design.
PROPOSAL: Require agreement between the available area, canvas, framebuffer and browser outer geometry. Check the fixture content viewport separately for responsive reflow and usable content below Chromium's own controls.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Context: Owner summary (docs/specs/remote-gui-adaptive-sizing.md:22); Design: Authenticated geometry requests and viewer control (:55-57); Design: Native browser and framebuffer sizing (:67); Design: Terms (:87); Acceptance Criteria: AC-03 (:95); Test Plan: AC-03 (:107); Open Questions: Q1 (:119-128)
EVIDENCE: AC-03 and Q1 promise that the most recently focused visible viewer controls size, while the protocol makes each newly received focus claim active and orders sequences only within one viewer. If viewer A focuses and its claim is delayed, viewer B can focus later and have its claim applied first; A's delayed claim then becomes active despite representing the older focus event. The same ambiguity affects a busy claim retried after B takes control. The table's definition of Active viewer instead refers to the latest claim, which is a different ordering. The planned old-request checks do not explicitly cover delayed claims from different identifiers.
PROPOSAL: Make Q1 distinguish server-accepted claim order from actual focus-event order and describe the selected guarantee consistently. Define how delayed or retried claims lose eligibility, and test a delayed A claim arriving after B has acquired control.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design: Viewer geometry (docs/specs/remote-gui-adaptive-sizing.md:47); Design: Native browser and framebuffer sizing (:65-67); Design: Partial failure and compatibility (:71-73); Acceptance Criteria: AC-04 (:96); Test Plan: AC-04 (:108)
EVIDENCE: The runtime remembers the latest successfully applied size and skips X11/subprocess work for confirmed duplicate requests, but the partial-failure design permits restoration to fail without specifying that this confirmation becomes invalid. For example, size A succeeds, resizing to B changes the window but fails at the clip step, and restoration leaves the window at B with clip A. A later reconnect requesting A matches the remembered successful size. An implementation following the duplicate shortcut can return unchanged without repairing the mismatched geometries, and can clear the failure notice despite the inconsistency.
PROPOSAL: Invalidate cached geometry confirmation whenever application or restoration leaves either geometry uncertain. Require a subsequent request, including the remembered size, to reconcile and confirm both geometries before returning success or clearing the notice; add this recovery case to the runtime tests.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design: Viewer geometry (docs/specs/remote-gui-adaptive-sizing.md:49); Design: Native browser and framebuffer sizing (:63-65); Acceptance Criteria: AC-04 and AC-05 (:96-97); Test Plan: AC-04 and AC-05 (:108-109); Open Questions: Q3 (:143-147)
EVIDENCE: Exported dimensions must remain between 320x240 and 4096x4096, while larger viewers must scale both dimensions uniformly to fit the maximum. These requirements conflict for sufficiently extreme aspect ratios. An observed arithmetic check gives 320x8192 -> 160x4096 under the prescribed proportional maximum clamp, violating the minimum width. The document does not define whether to retain the prior size, reject the measurement or alter the aspect ratio when no supported size can preserve that ratio. The route tests separately require out-of-range dimensions to be refused.
PROPOSAL: Add an explicit policy for measurements whose aspect ratio cannot fit both minimum and maximum bounds, raising the user-visible trade-off as an owner question. Test tall and wide cases that produce a subminimum dimension after proportional scaling.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Design: Viewer geometry (docs/specs/remote-gui-adaptive-sizing.md:49); Design: Native browser and framebuffer sizing (:61-65); Acceptance Criteria: AC-01 (:93); Test Plan: AC-01 and AC-04 (:105, :108)
EVIDENCE: AC-01 requires working geometry throughout the supported exported range up to 4096x4096, but its real-browser matrix stops at a 1440x900 viewer and does not exercise the minimum exported height of 240. AC-04 tests an above-maximum viewer through controlled geometry routes; that does not establish real X11, x11vnc and noVNC behavior at the supported boundaries. An implementation with a backend cap below 4096 could pass all specified real geometry checks while failing AC-01.
PROPOSAL: Add real backend/viewer cases at the exported minimum and maximum boundaries, accounting for the viewer toolbar when choosing outer viewer dimensions. Assert actual exported framebuffer and browser geometry there, plus representative one-axis maximum cases.

### R-2

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design: Native browser and framebuffer sizing (docs/specs/remote-gui-adaptive-sizing.md:63, :65); Acceptance Criteria: AC-05 and AC-06 (:97-98); Test Plan: AC-04, AC-05 and AC-06 (:108-110)
EVIDENCE: This revision adds automatic sizing of newly created normal windows and invalidation of cached geometry confirmation when the window set changes (:65). The proposed proofs cover duplicate measurements, existing owned and unrelated windows, a native menu and a page dialog. None explicitly creates a normal Chromium window after a successful resize, leaves the viewer dimensions unchanged and verifies that the new window adopts the current geometry. An implementation that adjusts windows only during viewport requests can pass those checks while a newly opened browser popup remains partly outside the exported clip on the larger backing display.
PROPOSAL: Add a real browser scenario that confirms a portrait size, opens an owned normal window without another viewer measurement and verifies its geometry and reachable controls through noVNC. Add native tests showing that window creation and destruction invalidate the duplicate shortcut while unrelated windows remain unchanged.

### R-3

NO FINDINGS

## Sources

- [Repository conventions](https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/AGENTS.md): task routes and pinned engineering rules.
- [Feature documents](https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/conventions/feature-documents.md): scope, acceptance, review and evidence rules.
- [Feature template](https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/guides/feature-document-template.md): section structure.
- [Documentation](https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/conventions/documentation.md) and [prose guide](https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/guides/humanize-prose.md): document wording.
- [Coding](https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/conventions/coding.md), [Go](https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/conventions/go.md) and [frontend testing](https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/conventions/frontend-testing.md): implementation and rendered-browser verification.
- [Delivery](https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/conventions/delivery.md) and [shared delivery](https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/knowledge/shared-delivery.md): artifact and publication boundaries.
- Installed `remote-gui` skill and README at version 0.3.0: owned-session access, browser phases and existing-dependency rules.
- Host x11vnc `-help`, read on 2026-11-18: `-clip`, synchronous `-remote clip:WxH+X+Y`, geometry queries and framebuffer resize support. The scratch probes above establish actual local behavior separately from the help text.

- [Conventions routes](https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/README.md): the task-specific pages selected for this work.
- [Managed dependency updates](https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/knowledge/managed-renovate.md) and [Go release paths](https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/knowledge/tag-driven-go-releases.md): retained dependency and release boundaries when extending the existing CI job.
