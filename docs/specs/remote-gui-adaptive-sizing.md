---
status: draft
status_description: "Backend probes passed; viewer policy decisions and independent spec review are pending."
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

Three decisions are awaiting the owner: whether the most recently focused viewer or first connected viewer controls the shared size; whether to use CSS pixels or device pixel density; and whether to keep the existing display tools with a larger backing buffer. The recommended combination is the most recently focused viewer, CSS pixels, and the existing tools. A 4096 by 4096 backing display needs about 64 MiB for its main 32-bit framebuffer, plus other session memory. This is an estimate, not a measurement of total memory use. The design below proposes that combination pending those answers.

The work includes request validation, ordering concurrent updates, bounded dimensions, recovery when resizing fails, clipboard focus protection, browser tests and plugin documentation. Private transport, owner authorization and human/agent handoff rules remain in force. There are no host dependency installations or changes to existing sessions. New sessions receive the implementation after the plugin is updated. An older supervisor continues with its original fixed sizing.

Scratch probes established that the installed x11vnc can change its exported dimensions and Chromium accepts narrow native window sizes. They did not establish the complete viewer behavior. Planned verification covers real noVNC, Chromium and Firefox viewers, responsive geometry, input, concurrent viewers, failure recovery and both handoff directions. Acceptance after a clean independent spec review authorizes task planning and local implementation. Merge, release, installation and changes to live sessions require separate authority.

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

The normal supported exported size is 320 by 240 through 4096 by 4096. For a larger viewer, scale both requested dimensions by the same factor to fit the maximum, preserving the viewer aspect ratio within integer rounding. For a smaller or zero-size area, keep the last applied size and proportionally fit it. Hidden viewers do not claim or resize. Retain noVNC proportional scaling while a request is pending, on another viewer, and on failure; adaptive sizing is automatic and adds no user toggle.

### Authenticated geometry requests and viewer control

Add a browser-only `POST /__remote_gui/viewport` route behind the existing session authentication, origin and upstream-ownership checks. App shares do not expose it. Require the exact same origin, `Sec-Fetch-Site: same-origin`, `Content-Type: application/json`, and `X-Remote-Gui-Viewport: 1`. Reject query parameters, duplicate security headers, unsupported methods, unknown JSON fields, noninteger values and bodies over 1 KiB before invoking the backend. The response uses `Cache-Control: no-store`; it contains only numeric dimensions, a control result and fixed error codes. No CORS access is added.

Each loaded viewer creates a random per-page identifier in memory and sends a monotonically increasing safe-integer sequence. Neither is an authentication credential. The body carries `viewer_id`, `sequence`, `claim`, `width` and `height`. A focused visible viewer sends `claim: true` on connect or an actual focus transition. Later measurements send `claim: false`. The proxy serializes control decisions and application: a new focus claim becomes active; only that active identifier's later measurements may change geometry. Duplicate or lower sequences never apply a change or reacquire control. An old queued resize from an inactive viewer is refused, so it cannot undo a newer claim. Responses distinguish `applied`, `unchanged`, `inactive` and fixed failure codes.

Keep a bounded table of at most 16 per-page sequence entries. Retain the active entry, expire inactive entries after 30 minutes, and refuse a new identifier while the table is full. Unknown identifiers must claim before sending measurements. On tab reload a new identifier makes a new claim. An inactive viewer gains control only on a new focus transition or reconnect while focused. Closing a viewer leaves the current size in place; another viewer's focus claim takes control without a disconnect dependency. This policy is proposed in Q1. The bound and sequence checks prevent unbounded memory and replay within retained entries; these identifiers provide no security beyond existing owner authentication.

### Native browser and framebuffer sizing

Reuse Xvfb, x11vnc and the existing authenticated X11 connection. Start a new browser session with a 4096 by 4096 backing display and an initial x11vnc clip of 1440 by 900 at origin zero. Chromium initially uses 1440 by 900. Add a typed viewport operation through `session.BrowserHandle` and `proxy.Options` to the browser runtime. Viewer requests never supply a display, PID, window identifier, executable, shell fragment or VNC control string.

The runtime validates dimensions independently and refreshes ownership of the recorded display, x11vnc and Chromium identities before mutation. Its geometry lock serializes resize, handoff and stop. It identifies the session Chromium's normal top-level windows through native X11 and process ownership, moves them to origin zero and sets their outer size. Extend the existing X11 helper; do not use CDP, browser-page evaluation or keystrokes for sizing in either phase. Publish the visible work area and constrain owned transient windows so menus and dialogs remain reachable within the streamed area. Never resize another session's window or an unowned X client.

Update x11vnc's exported clip using its existing executable, an argument array and this session's display/Xauthority environment. Only validated numeric geometry enters the control command. Bound each operation to two seconds and confirm the exported dimensions with an x11vnc query. Applying the full request succeeds only when the browser window geometry and exported area agree. Confirmed duplicate requests avoid X11 and subprocess work. The larger backing display is an internal bound; visible geometry and normal page layout follow the applied browser window dimensions.

Remember the latest successfully applied size in supervisor memory. Handoff launches the replacement Chromium at that size, using the existing phase restoration procedure. A geometry request during a transition receives a fixed busy response without applying a partial change; the viewer retains its newest pending measurement and retries after 500 ms, at most four times, then waits for the next focus, reconnect or geometry change. Stop cancels pending resize work and prevents any later mutation. Resize itself restarts neither Chromium nor the viewer connection and never changes the browser phase.

### Partial failure and compatibility

Validate the complete request before changing anything. Snapshot the prior window geometry and exported clip, resize the owned browser windows, then update and confirm the clip. If either step fails, attempt bounded restoration of both previous geometries. A request returns success only after both checks pass. On restoration failure report a fixed failure code and let noVNC fit the framebuffer it actually receives; do not claim the prior size was restored. Keep the session and profile available and do not restart processes to recover a resize. Later focus, reconnect or a changed measurement permits a fresh attempt. Preserve ordinary clipboard focus and never log clipboard or page contents.

The toolbar reports `Automatic sizing unavailable; fitting the shared browser.` after a backend failure, while preserving connection state separately. A later confirmed size clears that notice. A busy transition does not show a permanent failure notice. Use an accessible status region that does not steal keyboard focus.

Existing supervisors and their records keep working without migration; the new size state is not persisted in records or reusable profiles. After an explicit plugin update, new sessions use the new implementation. Returning to the previous plugin affects new sessions only and restores fixed sizing. Do not stop or rotate an existing session to install or demonstrate this feature.

### Artifacts and delivery

The affected artifact is the independent `plugins/remote-gui` source package, discovered by the existing marketplace entries. Its source-keyed helper builds the Linux binary locally. Increment both plugin manifests together from 0.3.0 to 0.4.0 for this capability, and document sizing, limits, viewer control, fallback and the need for a new session. Keep the package independent of the vh-adlc runtime.

Validate the package through its existing helper from a temporary install-shaped copy, as well as building the Go module directly. Extend `tests/remote-gui` and the existing remote-gui CI job for the new browser scenarios. Record separate evidence for source checks, package behavior, independent review and any later release or installed behavior. This feature's current authorization does not merge, release or update the installed marketplace plugin.

### Terms

| Term | Meaning |
| --- | --- |
| Active viewer | The visible viewer that most recently claimed size control on focus or connection. |
| Available area | The viewer space below the toolbar, measured in CSS pixels. |
| Automatic sizing unavailable; fitting the shared browser. | Sizing failed; the viewer still proportionally fits the framebuffer it receives. |

## Acceptance Criteria

- [ ] AC-01: On initial connection and after window resizing or orientation changes, the browser fills the active viewer's available area at CSS-pixel dimensions within two pixels on each axis, throughout the supported size range, without stretched content or persistent empty bands.
- [ ] AC-02: A size change preserves the browser process, open tabs, fixture form values, viewer connection and exact-browser input in both human and agent phases, and human status continues to omit a CDP endpoint.
- [ ] AC-03: With two viewers, the most recently focused visible viewer controls size; inactive, hidden, duplicate, out-of-order and already queued older requests cannot override its applied size, and viewer bookkeeping stays bounded.
- [ ] AC-04: Repeated or rapidly changing measurements converge on the latest eligible size with bounded work; unsupported sizes and backend failures retain a usable proportional view, show the defined failure notice when appropriate, and permit recovery on a later eligible event.
- [ ] AC-05: Geometry requests require the existing session owner and same-origin protections, accept only the bounded typed payload, and cannot mutate an app share, another browser session or an unowned window.
- [ ] AC-06: Handoff preserves the last applied size in both directions, concurrent handoff or stop cannot leave a successful partial resize, clipboard typing retains focus across size changes, and Chromium menus and fixture dialogs remain visible and usable.
- [ ] AC-07: The independently packaged plugin and both manifests agree on the new version, its documented sizing terms match the viewer, its verification runs through the existing CI path, and existing supervisors and records continue to work without migration.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Add `tests/remote-gui/viewport.e2e.test.ts` with a synthetic responsive page and real CLI/noVNC. Run Chromium and Firefox viewers at 320x568, 390x667, 390x844, 844x390, 768x1024, 1024x768, 900x1000, 1280x720 and 1440x900. Measure canvas CSS bounds, canvas framebuffer dimensions, browser outer X11 geometry and the fixture content viewport; assert two-pixel agreement with the area below the toolbar, correct responsive reflow and no horizontal overflow. Resize a connected page through portrait/landscape and back. Inspect synthetic screenshots at phone, reported tall-viewer and desktop sizes; retain initial failures separately. |
| AC-02 | In the real fixture, preserve synthetic tab URLs and form values while resizing in human mode, verify input through noVNC and marker checks, confirm human status has no CDP, then hand off and observe agent state. Repeat resizing in agent mode with unchanged browser PID/start identity and CDP URL. Track the noVNC WebSocket and assert no disconnect. Test-only agent CDP may observe fixture state; the resizing implementation must use native X11. |
| AC-03 | Proxy tests with a blocking fake backend submit focus claims, old in-flight updates, duplicate sequences, hidden-client measurements and concurrent requests. Assert final dimensions and backend call order. Exercise 17 identifiers, expiry with an injected clock and reload. In the real two-viewer fixture, focus each viewer and verify the browser follows it while the other canvas scales; hide and close the active viewer, then focus the survivor. |
| AC-04 | Extend `viewer-page.e2e.test.ts` with controlled geometry routes and recorded calls: drive a resize burst, equal measurements, zero/small areas, a viewer above the maximum, a delayed response, disconnect/reconnect, 409 busy and exhausted retry. Assert one in-flight request, a replaceable pending value, the 150 ms debounce and bounded busy retries. Runtime tests inject X11/clip/query and restoration failures and check fixed responses and later recovery. Exercise high-DPI context with CSS sizing, reduced motion, clipboard-panel keyboard resizing and actual 200 percent browser zoom with its method/effective viewport recorded. Real noVNC failure fixture refuses one resize, keeps input working, then permits a changed size. |
| AC-05 | Extend Go proxy tests for unauthenticated and wrong-owner requests; missing/foreign/duplicate Origin and security headers; missing/foreign fetch-site; bad content type; methods; queries; oversized/malformed/unknown/duplicate JSON fields; unsafe sequences; noninteger/out-of-range dimensions; expired sessions; and app-share routing. Assert zero backend calls on refusal. Native X11 tests create owned and unrelated windows and confirm only eligible owned normal/transient windows change. A second real session retains its geometry and input throughout the first session's resize. |
| AC-06 | Runtime tests interleave resize with both handoffs, stop and injected partial failure under `go test -race`; assert complete application or busy/failure, cancellation on stop and no later mutation. Real fixture uses both handoffs at a portrait size, opens a native Chromium menu and a synthetic page dialog near the viewport edge, and verifies controls remain reachable and usable through noVNC. Chromium/Firefox viewer cases type synthetic clipboard text while the keyboard/viewport resizes and assert focus and remote clipboard contracts. |
| AC-07 | Run module build, `go test -race ./...`, `go vet ./...`, golangci-lint v2.15.0 config/run, and `go mod tidy -diff`; `bun test tests/remote-gui`; and the opt-in real browser suite with both viewer engines. Package tests check both 0.4.0 manifests and build through `scripts/remote-gui.sh` in an install-shaped copy. Compatibility tests load an old record and exercise an old fixed-size supervisor independently of a new session. Check documentation against implemented labels/limits and CI inclusion. No installed or released behavior is claimed from these checks. |

## Tasks

None yet; written after owner acceptance.

## Open Questions

### Q1: Which viewer should control the browser size when more than one is open?

**Recommendation:** A. Follow the most recently focused viewer so the device being used gets the available space.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Most recently focused viewer** | Automatic fit on the device currently in use. | Other viewers scale when control changes. |
| **B. First connected viewer** | A stable size while the first viewer remains connected. | A second device cannot fit itself until the first releases control. |

**Why this is yours:** Both are valid user-visible behavior when one browser is shared across devices.

### Q2: Should remote sizing use CSS pixels or device pixel density?

**Recommendation:** A. Use CSS pixels to preserve normal text size and bound rendering work.

| Option | You get | It costs |
| --- | --- | --- |
| **A. CSS pixels** | Readable browser-sized controls and lower rendering cost. | High-density screens may show softer pixels. |
| **B. Device pixel density** | More framebuffer detail on dense screens. | More bandwidth and memory; readable sizing needs density handling too. |

**Why this is yours:** Sharpness and resource use affect the owner's remote experience.

### Q3: Should sizing keep the existing display tools with a bounded larger backing display?

**Recommendation:** A. Keep Xvfb and x11vnc with a maximum 4096 by 4096 backing display and resize the streamed area and browser.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Existing tools, larger backing display** | The measured backend mechanism and no new host dependency. | About 64 MiB for the main framebuffer per session, plus other memory; larger viewers proportionally fit. |
| **B. Different display server** | An opportunity for native display-resolution negotiation. | A new dependency and a wider setup/compatibility change that needs its own evidence. |

**Why this is yours:** The backend choice trades a bounded per-session resource cost against new workstation setup.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |

## Sources

- [Repository conventions](https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/AGENTS.md): task routes and pinned engineering rules.
- [Feature documents](https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/conventions/feature-documents.md): scope, acceptance, review and evidence rules.
- [Feature template](https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/guides/feature-document-template.md): section structure.
- [Documentation](https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/conventions/documentation.md) and [prose guide](https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/guides/humanize-prose.md): document wording.
- [Coding](https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/conventions/coding.md), [Go](https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/conventions/go.md) and [frontend testing](https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/conventions/frontend-testing.md): implementation and rendered-browser verification.
- [Delivery](https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/conventions/delivery.md) and [shared delivery](https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/knowledge/shared-delivery.md): artifact and publication boundaries.
- Installed `remote-gui` skill and README at version 0.3.0: owned-session access, browser phases and existing-dependency rules.
- Host x11vnc `-help`, read on 2026-11-18: `-clip`, synchronous `-remote clip:WxH+X+Y`, geometry queries and framebuffer resize support. The scratch probes above establish actual local behavior separately from the help text.
