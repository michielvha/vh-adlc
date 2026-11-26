---
status: in-progress
status_description: "iPhone Safari release verification and viewer corrections are in progress."
branch: feat/remote-gui-mobile
issue: null
goal: "Tap a remote Chromium field, then tap its inline prompt to type using the phone keyboard."
covers:
  - plugins/remote-gui/
  - tests/remote-gui/
  - .github/workflows/ci.yml
  - .agents/plugins/marketplace.json
  - .claude-plugin/marketplace.json
---

# Plan: Mobile keyboard for remote Chromium

Make the shared browser usable from a phone. Tap a remote field to place its caret, then tap the inline prompt to open the phone's keyboard.

## Context

### Owner summary

The viewer uses the installed stock Chromium and existing noVNC stream. The first tap is an ordinary remote click. When the viewer can match Chromium’s current editable focus to the tap, it offers **Tap to type** over that field. In iPhone Safari, the second tap opens the native keyboard. The first tap leaves the keyboard closed. A site can cover a field while Chromium still reports the field as focused, and the prompt can then appear over that cover. There is no keyboard button in the toolbar.

The owner accepted a second tap and ordinary remote keyboard behavior on 2026-11-19. Typing follows the remote browser's current focus, like a hardware keyboard. A page can move that focus. The viewer displays this behavior when opening the keyboard and clears the editor and pending composition when its live checks detect a focus or eligibility change. This replaces the earlier requirement that an edit stay attached to a particular field even when scripts change focus. The older real-stream and IBus tests reproduced that race. This revision does not treat those tests as evidence that the proposed two-tap viewer works.

The first tap still needs a private accessibility check so the viewer can put the prompt in the right place. The helper reads the owned browser's editable state and geometry. The previously approved input-type attribute read remains limited to an eligible field whose keyboard mode cannot be inferred from its role and state. The viewer needs a verified match before it shows a new prompt. A temporary verification failure can pause an open keyboard for up to three seconds. Typing resumes if the same field and phase are verified in that time. Keys entered during the pause are discarded. A successful lookup with no match at the original tap closes the editor and clears pending composition. The browser stays sandboxed and human sign-in keeps debugging, automation and extensions disabled. A failed helper leaves the existing desktop viewer usable.

The first release covers iPhone Safari. The owner deferred Android verification on 2026-11-22. The independently built package from `86ae7838` passed the native two-tap test on iOS 27.2.1 and sent one synthetic character to the remote field. The [CI run for that commit](https://github.com/michielvha/vh-adlc/actions/runs/44952292092) passed all six jobs. On the same binary from `9bf555a3`, desktop touch emulation verified rollback and cleanup when the helper failed or the session expired. The remaining iPhone and privacy cases, packaging checks on the release candidate, and independent implementation review still need evidence. Accepting this scope keeps those checks in the release plan and moves Android coverage to follow-up work.

When the owner opens a remote browser on iPhone and needs to enter a URL or fill a form, the streamed canvas cannot summon the phone keyboard on its own. They have to switch devices or use another input method. The owner chose an inline second tap so the keyboard opens at the field without leaving it for a toolbar control.

### Two-tap feasibility fixture

The [disposable two-tap fixture](../../tests/remote-gui/mobile-feasibility/two-tap/README.md) ran stock Chromium 156.0.8078.79 on Xvfb with a private AT-SPI bus, noVNC 1.5.0 and x11vnc 0.9.17. A synthetic site supplied input-event booleans for test assertions. The viewer decided whether to show the prompt using only the private helper’s sampled focused state and bounds. Desktop touch emulation verified the plain tap, prompt with the local input unfocused, second tap and one synthetic edit through real RFB. An independent check of AT-SPI `Component.GetAccessibleAtPoint` on the owned frame resolved the test text entry, password entry and plain document at their respective coordinates. A bounds-only check incorrectly offered the prompt after an overlay covered a still-focused field. The component hit test subsequently resolved the overlay in that case. In a second synthetic run, three checks warmed the hit cache before a page overlay covered the still-focused field. Three immediate checks and a later check still returned the original text entry. Chromium explains the possible cached or approximate answer in [CachingAsyncHitTest](https://chromium.googlesource.com/chromium/src/+/refs/tags/156.0.8078.79/ui/accessibility/platform/browser_accessibility_manager.cc#2033). The current stock probe cannot certify visual unobstruction. The owner accepted showing the prompt for the reported editable focus even when a page covers it.

Physical iPhone 15 Pro Max on iOS 27.2.1 ran `testTwoTapsOpenNativeKeyboardAndType` in Safari against that disposable fixture over verified owner-only HTTPS and WebSocket. The first field tap showed the inline prompt with the keyboard closed. The second opened the real keyboard and one synthetic character arrived through RFB. The retained XCTest result bundle on the Mac at `/tmp/rg-two-tap-tests.3kkDQ0sU/device-probe.xcresult` recorded one pass and no failures or skips. The paired USB Android was locked when the corresponding queued test tried to run. The fixture uses simple focus and bounds detection. Packaged integration, focus association, geometry and expiry checks, and the rest of AC-10 through AC-14 remain unverified. In a separate desktop fixture, an omnibox tap exposed an editable single-line native entry under Chromium’s toolbar with no recognized input-type attribute. A page contenteditable with an explicit textbox role exposed an editable multiline entry. A subsequent stock run found that an ordinary contenteditable without an ARIA role exposed an editable multiline section and showed the prototype prompt. The separate disposable probe scripts are under `/tmp/rg-two-tap-fields.ku8nNSyD` and `/tmp/rg-two-tap-warm-hit.QcaPSekU` on the test host.

### Packaged implementation checks

The local implementation adds a private focus helper and an authenticated phase reader in `d8604476`, then the noVNC prompt and local editor in `1f409906`. In `tests/remote-gui/mobile.e2e.test.js`, a real stock Chromium browser and real noVNC viewer passed the ordinary two-tap flow with a synthetic text field. The prompt stayed usable across an initial lease. The editor remained usable past the first lease and produced exactly one remote input. The same run held a lookup and showed that an observed phase change discarded pending composition and prevented a late commit from reaching the synthetic field. A separate check in that test read the advanced phase through the authenticated route before a real Chromium handoff finished.

The broader desktop run initially missed the Firefox sizing debounce assertion and intermittently lost the mobile prompt during a slow focus renewal. That build rechecked the last verified field without rescanning the tree. The later focus worker replaced that search with AT-SPI’s focused-state query. Three successive diagnostic mobile runs and the tracked end-to-end test passed afterward. The dormant editor is hidden, and the Firefox sizing test passed two focused reruns. Chromium and Firefox also passed the real noVNC viewport and Clipboard regressions in the broader run.

The module race suite, Go vet, tidy check and pinned Go lint passed. The focused Go tests verified same-origin and authenticated requests, refusal of invalid inputs, expiry, the independent phase route and the unit-scale precondition. The installed-copy package checks passed all eleven cases. The physical iPhone proof above covers the earlier fixture. The paired iPhone developer connection was inactive and the USB Android remained locked when checking for packaged device verification. When the phones reconnected, the packaged test browser and private route were verified. Both phones were still locked. The signed XCTest runner built successfully and Xcode could not launch it while the iPhone was locked. The owner-only fixture and runner were stopped after the wait. AC-10 through AC-14 stay open for the remaining proof.

The physical iPhone 15 Pro Max on iOS 27.2.1 subsequently tested Safari against the packaged viewer from `492c2f9e`, binary SHA-256 `84560fbdad131a000bf0c255fcaa39f270929cf2dae94454f425768d8163f952`. The first run reached the inline prompt, but XCTest did not see a keyboard after tapping it. On two reruns, the runner launched Safari explicitly before opening the viewer URL. Each used a fresh owner-only session and the same uninstrumented binary. A plain tap kept the keyboard closed, the first field tap showed the prompt with the keyboard closed, and tapping the prompt opened the native keyboard. In each run stock Chromium received `z` in the focused synthetic field with exactly one input event. The initial failure was not reproduced. The Mac retained the failure in `/tmp/rg-pkg-two-tap.unqLBz7p/device-probe.xcresult` and the passes in `/tmp/rg-pkg-two-tap.eQDGzH2e/device-probe.xcresult` and `/tmp/rg-pkg-two-tap.74K561xG/device-probe.xcresult`. The owner limited these runs to iPhone Safari and the ordinary text scenario. The remaining acceptance criteria are still open.

During daily-use testing, the owner reported that the sizing notice blocked the Chromium tab strip and typing was unreliable. A real noVNC session reproduced the overlap at a 393 CSS pixel viewport. Typing in the Chromium address bar also failed when replacing the last character or when the keyboard lost focus during a lookup. The repair keeps the notice in the viewer toolbar, retains recent local edits while typing, and checks the browser toolbar before searching page content. It retries transient lookup failures without extending an existing focus lease. In three fresh Chromium sessions with a touch-enabled viewer, opening a new tab worked with sizing fallback visible. Editing the full URL loaded `https://example.com/` and tapping the original tab switched back. The managed browser regression also checks the address bar and a page field against stock Chromium and noVNC. At that point, a native iPhone run and Android verification were still pending for the repaired build.

The hosted mobile test exposed a separate difference in Chrome 157.0.8103.50. The helper found the focused address entry but reached the 256-node search limit before it could rule out another match. Raising the limit to 384 kept the same lookup deadline in that build. The later focused-state query removed the walker and its node limit. The managed browser regression and the public URL and tab-switch workflow passed locally with the matching Chrome Stable build and noVNC 1.6.0.

The owner then reported that the phone keyboard sometimes closed while typing a URL. In the stock Chromium address-bar test, interrupting focus checks past the 500 ms lease reproduced the dismissal. The viewer now keeps the local editor open for up to three seconds during a temporary loss of verification. It pauses remote keys and discards unsent input and composition. Verification of the same field and phase resumes typing without reopening the keyboard. A reported focus or phase change still closes the editor immediately. The browser test interrupts both types of check and requires the exact URL to load after recovery.

The owner also saw empty space above and below Chromium after submitting a URL on iPhone. The browser test reproduced a resize request at keyboard height when the editor blurred before the visual viewport expanded. Holding back that request kept the framebuffer at full height. The test then reproduced a separate scaling problem: noVNC kept fitting the canvas to the short viewport after the container returned to its expected size. The viewer now reclaims remote sizing after the viewport expands and reapplies noVNC's public scaling setting when the container changes dimensions. The Chromium test checks the requested size, framebuffer size and actual canvas height.

The owner tried the repaired private iPhone preview built from `17ea67e3` on 2026-11-20, reported that it was much better, and approved shipping the work. This covers the owner's use of the preview after the keyboard and sizing fixes. The remaining acceptance checks stay open.

A temporary failure from the browser phase endpoint canceled the first tap even when the separate focus endpoint returned the correct address bar. The stock Chromium and noVNC regression injects one HTTP 503 on each route before the same tap. The viewer now retries the phase check for the same tap. A visible prompt dims and rejects activation while phase verification is unavailable. It can recover within its original lease once both checks agree. Expiry or a confirmed phase change still clears the prompt. The browser regression passed with the repair. A separate Chromium check also verified the disabled prompt, recovery on the same tap, and expiry without revival.

### Evidence from the first design

The first design passed the vh-adlc in-progress gate and stopped at its feasibility task. The following evidence describes that design and the probes preserved in Git.

The installed noVNC 1.5.0 provides focus, key transport, gesture recognition and a local text bridge. The application bridge opens its editor from a keyboard button. It has no remote editable region metadata. Its text loop works in UTF-16 code units, so the source alone does not establish composition or Unicode correctness.

`bash tests/remote-gui/mobile-feasibility/run-editable-metadata.sh <new-artifact-directory>` runs the synthetic Chromium probe. It uses a private bus, isolated profile and Xvfb display. The launcher and registry had to be started explicitly after D-Bus service activation was denied on this host. The probe checks the publisher PID and reads roles, state and bounds. Chromium 156.0.8078.79 with renderer accessibility enabled reported the same role and state for text, email, URL, search and telephone inputs. Numeric, password and multiline controls had distinct signatures. With `REMOTE_GUI_PROBE_GEOMETRY_ONLY=1`, the probe exited 1 because roles and states could not select the required keyboard modes.

The [Chromium attribute implementation](https://github.com/chromium/chromium/blob/156.0.8078.79/ui/accessibility/platform/ax_platform_node_base.cc#L1064) includes `text-input-type` in the same map as page placeholders and HTML input names. The [AT-SPI Accessible interface](https://github.com/GNOME/at-spi2-core/blob/2.58.9/xml/Accessible.xml#L989) exposes that map through `GetAttributes`. It has no method to select one object attribute. The first probe did not call it. A second synthetic run with the approved read resolved text, email, URL, search, telephone, numeric and password types. The multiline state identified the textarea. The email control included synthetic description and input-name markers. They were present in the D-Bus reply and absent from the emitted modes and retained diagnostic logs. This proves host-side classification for those controls. It does not exercise phone focus, control transfer or remote editing.

With two authenticated RFB clients on the disposable Xvfb display, x11vnc 0.9.17's `-afteraccept` hook reported distinct native client IDs and source ports. A synchronous `client_input` change blocked pointer motion from the disabled client while the enabled client could still move the pointer. With the old viewer holding Button 1, the disable acknowledgement left that button down and the next viewer's pointer move was blocked. The command alone does not fence a transfer. The deployed WebSocket attribution, queued input drain and target-bound editing remain to be proved.

The same synthetic HTTPS viewer can exercise both phone browsers. On iPhone, an Xcode UI test can send a screen tap in Safari and assert the system keyboard appears. On Android, ADB can drive Chrome taps and record Android's input method visibility along with an OS screenshot. Both runs also need to assert which synthetic remote field received the caret and that taps outside editable regions leave the keyboard closed. An iOS Simulator or Android emulator can help develop these runs. Neither replaces the accepted physical phone proof. The Mac is reachable over SSH, but Xcode reported administrator authorization was required for its components and listed no paired device. No physical Android device was available to the run.

### Physical iPhone gesture probe

Xcode 27.0 ran `testSelectiveFirstTapOpensNativeKeyboard` on a wirelessly paired iPhone 15 Pro Max with iOS 27.2.1. XCTest reported one pass, zero failures and zero skips. In Safari, the keyboard started closed and stayed closed after the plain-area tap. It appeared after the first editable-area tap. The probe uses noVNC 1.5.0's stock gesture recognizer and focuses a real local input from the one-tap callback.

The [reproducible fixture](../../tests/remote-gui/mobile-feasibility/keyboard-gesture/README.md) uses fixed hit regions on a synthetic canvas. It establishes the iPhone's native keyboard opening mechanism. It does not exercise live Chromium geometry, remote caret placement, typing or RFB controller transfer. This result did not satisfy the first design’s T1 gate or AC-01.

### Physical Android gesture probe

ADB ran the same synthetic canvas and noVNC 1.5.0 gesture module over USB on a physical KB2003 running Android 12 and Chrome 146.0.7680.178. The temporary ADB reverse connection served matching fixture files. Android's input-method service reported the keyboard closed at the start and after one plain-area tap, then shown after the first editable-area tap. The window manager separately reported a visible IME inset. The runner removed its reverse mapping. One replay stopped when its ADB server exited before the taps. The saved runner repeated both assertions through the Mac's main ADB server.

These two phone probes establish native keyboard opening for the synthetic regions on the tested devices. At the time of the first design, Android coverage, live field targeting, caret placement, typing and controller transfer remained unproved.

### Remote field binding feasibility

The installed Chromium 156.0.8078.79 exposed roles, state and geometry on its private AT-SPI bus. It advertised no `EditableText` interface for the eight synthetic controls tested. A direct `EditableText.InsertText` request against the verified owner of the plain test field returned `org.freedesktop.DBus.Error.UnknownMethod`. The probe queried no field value or text. This matches the [Chromium Linux accessibility implementation](https://github.com/chromium/chromium/blob/156.0.8078.79/ui/accessibility/platform/ax_platform_node_auralinux.cc#L2383), which registers text and selection interfaces but does not register `AtkEditableText`.

The [focus race probe](../../tests/remote-gui/mobile-feasibility/README.md) opened an isolated human browser through the source-built remote-gui CLI, stock noVNC 1.5.0 and x11vnc 0.9.17. A control key reached confirmed field A. In the first scenario, the synthetic page moved focus to B after the acknowledgement of A and before a second key. The key reached B. In the second scenario, A was still focused immediately before the second key and the page moved focus to B in A's keydown handler. The key reached B again. These were real RFB key events. The fixture reported only the destination of its input event and never read the field contents. Both runs stopped the isolated browser.

A single viewer and a focus read cannot protect an edit sent as a global RFB key on Chromium. The first design required a target-scoped delivery path and stopped at its feasibility gate. The owner later accepted ordinary current-focus typing.

[Firefox's Linux accessibility source](https://github.com/mozilla-firefox/firefox/blob/ad9e608654767b746c82196bf2de7c867c564498/accessible/atk/nsMaiInterfaceEditableText.cpp#L28) implements insertion addressed to an accessible object. A separate, disposable Firefox probe could test whether that API preserves the target across a focus change, without reading values or enabling debugging. This source finding does not establish that Firefox meets the feature scope. A browser change would also need a separate handoff and compatibility review.

### Alternative host editing probes

Firefox 159.0.1 on Fedora advertised `EditableText` for ten synthetic targets, including password, numeric, contenteditable and cross-origin frame controls. `InsertText` returned true when the target was focused and after focus moved. `SetTextContents` also returned true on focused targets. The fixture observed neither a mutation nor an input event after any of those calls. A real X11 key on the same fixture produced both the expected mutation and input event, after explicit native window focus. The [AT-SPI 2.58.9 adaptor](https://github.com/GNOME/at-spi2-core/blob/2.58.9/atk-adaptor/adaptors/editabletext-adaptor.c#L76) returns true after dispatching insertion and cannot confirm the field changed. These results do not support changing the hosted browser to Firefox.

In a separate synthetic Chromium document, `setRangeText` rejected email and number controls and the test had to dispatch an untrusted input event itself. The in-page `insertText` command inserted the fixture character and emitted a trusted input event for nine tested types, including password, email, number, textarea and contenteditable. A separate browser-level insertion followed the new focus to the other field. Those comparisons used automation on disposable documents only. A separate disposable Chromium extension also edited a synthetic password field and emitted one trusted input event. After focus moved to another field, the extension cancelled the stale edit and that field stayed empty. The test page only observed edits. This demonstrates a browser-side attachment for page fields. It does not cover the browser address bar or meet the accepted extension-free human-mode boundary.

The [real stream fixture](../../tests/remote-gui/mobile-feasibility/live-stream/README.md) ran stock x11vnc, websockify and noVNC with a fresh sandboxed Chromium browser and a cooperating page. With the desktop touch test, the first tap selected the live remote field and one edit reached it. When the page changed focus before applying a second edit, it cancelled the edit and the second field stayed empty. A synthetic page supplies the geometry and guards the edit inside the same document. This does not establish an unmodified browser integration, login-site coverage, browser address edits or the controller transfer guarantee.

The physical iPhone 15 Pro Max on iOS 27.2.1 ran the [live-stream XCTest](../../tests/remote-gui/mobile-feasibility/live-stream/LiveStreamTests.swift) over a verified private HTTPS and WebSocket route. A plain tap kept Safari's keyboard closed. The first tap on live field A opened it and focused A. Typing emitted one edit in A. A second edit queued before the fixture switched focus to B was cancelled and B stayed empty. XCTest recorded one pass with zero failures or skips. The first integrated Android run lost its ADB backend. The USB connection recovered, but the physical Android still showed its lock screen and could not run the live-stream taps. Its earlier first-tap result covers the standalone native keyboard fixture.

On x11vnc 0.9.17, the [two-client Xvfb probe](../../tests/remote-gui/mobile-feasibility/README.md#x11vnc-controller-transfer) matched two owned loopback source ports to distinct x11vnc client IDs. Disabling the old client blocked its next pointer move. With its button and Shift held, synchronous disable and client disconnection both left those inputs held. Closing the old connection, explicitly releasing those inputs on the disposable display and waiting for X11 to process the release let the successor move, press and release those inputs. This result covers the two raw RFB clients and known test inputs. WebSocket attribution and the full input transfer contract remain open.

The [Chromium 156 Linux adapter](https://chromium.googlesource.com/chromium/src/+/refs/tags/156.0.8078.79/ui/accessibility/platform/ax_platform_node_auralinux.cc#2431) has text selection and range value interfaces. It does not expose the editor's range replacement operation. Chromium has separate internal actions for [Blink range replacement](https://chromium.googlesource.com/chromium/src/+/refs/tags/156.0.8078.79/third_party/blink/renderer/modules/accessibility/ax_object.cc#8073) and [omnibox selection replacement](https://chromium.googlesource.com/chromium/src/+/refs/tags/156.0.8078.79/chrome/browser/ui/views/omnibox/omnibox_view_views.cc#1695). Those paths suggest where a native implementation could attach. Neither establishes a Linux API that verifies the target at commit time or a safe behavior when site code changes focus during the edit.

The [native IBus probe](../../tests/remote-gui/mobile-feasibility/README.md#linux-input-method) used IBus 1.5.33, GTK 3 and sandboxed Chromium 156.0.8078.79 on a private Xvfb display. Its native commit produced one trusted input in the focused field A. After the page moved focus to field B, the same IBus context accepted a delayed commit and B received it. With A focused when a separate commit started, the page moved focus to B in its `beforeinput` handler and Chromium finished that edit in A. The first race alone fails field binding. The tested IBus context identifies the browser input client across both fields, and [Chromium's asynchronous commit](https://chromium.googlesource.com/chromium/src/+/refs/tags/156.0.8078.79/ui/base/ime/linux/input_method_auralinux.cc#467) uses the current client.

### Existing mobile viewers

The owner rejected maintaining a private Chromium build. [noVNC 1.7.0](https://github.com/novnc/noVNC/blob/v1.7.0/app/ui.js#L253-L274) and the development source checked on 2026-11-19 still use a keyboard button to focus a local editor. The [upstream field-tap discussion](https://github.com/novnc/noVNC/issues/1501) explains that a VNC image does not identify where the remote application places its text fields. The [proposed noVNC text sender](https://github.com/novnc/noVNC/pull/2073) runs after an explicit Send action and encodes text as ordinary keys.

[Kasm](https://kasm.com/cloud-personal/docs/latest/control_panel.html#show-keyboard-controls) and [n.eko](https://github.com/m1k1o/neko/pull/522) also document explicit keyboard controls. [Cloudflare Browser Isolation](https://developers.cloudflare.com/changelog/post/2026-09-09-ios-tap-to-type/) uses an inline prompt over the focused field on iOS. Its documentation requires a second tap. The published [remote-surface 1.6.0](https://www.npmjs.com/package/@opendatalabs/remote-surface/v/1.6.0) library offers field-focus events through injected CDP listeners. Its text sender calls `Input.insertText` without a field identity. The package shows a different way to detect fields, and the existing [synthetic Chromium comparison](../../tests/remote-gui/mobile-feasibility/edit-command-probe.cjs) shows why that insert API falls short of the accepted binding. These source checks found no drop-in viewer that met the first design’s first-tap and field-binding requirements for human mode.

The first-tap, field-bound design stopped at T1. No production browser path was changed by those probes.

### Resizing prerequisite after merge

[PR 121](https://github.com/michielvha/vh-adlc/pull/121) merged at [0708e3cb](https://github.com/michielvha/vh-adlc/commit/0708e3cb33dd1fe1e85f4e8da74b598ee32f96a0) on 2026-11-19. Both remote-gui manifests at that commit report 0.4.0, and both marketplace catalogs resolve to its local package. This establishes the prerequisite in the default-branch source; it does not establish an installed plugin update or any mobile capability.

Independent R-3 rechecked this unchanged mobile baseline against the merged source with no findings. Model identity was not attested and isolation was procedural. At that checkpoint, the normative baseline matched R-2 and its acceptance still applied. Mobile planning and feasibility work followed later.

### Background

At default-branch commit [cdf8956](https://github.com/michielvha/vh-adlc/commit/cdf89564a5d079340922584c83f183ca4ffa8cc2), the viewer imports noVNC's RFB core and connects a canvas. Its local textarea belongs to the Clipboard panel; resize restores canvas focus except while that panel owns focus (`plugins/remote-gui/internal/proxy/viewer.go:30,39-45,118-128`). Human Chromium disables extensions; only agent mode adds automation and loopback debugging (`plugins/remote-gui/internal/browser/phase.go:20-58`). Owner identity and expiry checks precede viewer access (`plugins/remote-gui/internal/proxy/proxy.go:289-315`, `identity.go:17-67`). Existing X11 helpers handle clipboard, menus and native windows, not page-editable semantics (`plugins/remote-gui/internal/xclip/xclip.go:1-5`, `menus.go:1-16`).

Adaptive sizing is prerequisite work in [PR 121](https://github.com/michielvha/vh-adlc/pull/121), observed open at [d9849b1](https://github.com/michielvha/vh-adlc/commit/d9849b1be481b5bfea02f7b7e566f33ac3668cf2) before this revision. Its reviewed implementation at [e2ac2d7](https://github.com/michielvha/vh-adlc/commit/e2ac2d757750d3495a1167dfd5ea29674ad68ca1) and committed state at [417c4c4](https://github.com/michielvha/vh-adlc/commit/417c4c4e61bef22946b5e26e205c68e9ad1e77df) resize the visual viewport and owned X11 browser (`plugins/remote-gui/internal/proxy/viewer.go:122-207` at 417c4c4). Those commits do not establish native phone keyboard behavior. A PR is not proof of merge, release or installation. At mobile implementation intake, verify the backend exists in the selected implementation base; otherwise wait for its separately authorized merge.

Read-only inspection found noVNC 1.5.0 installed on this host. RFB already provides keyboard capture, key transport, focus and gestures; its separate application has a local text-input bridge (`core/rfb.js:261-266,304-317,461-489,1257-1374`; `app/ui.js:250-264,1439-1595`). Current upstream 1.7.0 retains the application bridge pattern. These are existing upstream capabilities, not new remote-gui inventions. Neither the documented RFB API nor that bridge supplies a remote editable-field map or selective first-tap phone-keyboard activation.

Read-only host checks found Python `gi`, `pyatspi` and `dbus`, AT-SPI libraries, `dbus-run-session` and the AT-SPI bus launcher/registry. No accessibility bus/tree or GUI session was opened for this research. Other hosts may lack these dependencies.

## Scope

- Support the two-tap flow in iPhone Safari with a stock sandboxed Chromium host. Cover ordinary text, password, textarea, contenteditable, nested cross-origin frames, and Chromium's address bar once focused. Use the safe phone keyboard mode when the owned helper identifies it.
- Defer Android Chrome support verification to a follow-up.
- Place the prompt within the bounds of the Chromium-reported editable focus. A covered field can still qualify while Chromium reports it focused. Keep mouse, hardware keyboard, existing noVNC touch gestures, Clipboard and adaptive resizing usable. Taps outside the reported editable bounds or without verified metadata leave a new prompt hidden.
- Keep human sign-in free of CDP, automation, and extensions. Exclude a modified Chromium, an extra toolbar keyboard button, a clipboard bridge for typing, and new desktop streaming infrastructure.
- The phone keyboard behaves as a normal remote keyboard. This revision does not promise atomic editing of a fixed DOM field, a new single-controller policy, or additional scroll/drag mappings. The first-tap and controller-fence checks from the prior design are preserved in Git as historical requirements and results.

## Design

### Detect and show the prompt

Use an optional per-session accessibility helper and bus for the owned display, never the desktop session bus. Start these as owned resources, track their process identity, and tie their lifetime to the browser's phase and session expiry. The helper identifies the verified Chromium publisher by its D-Bus peer PID and the session's owned browser identity. It may query role, state, ancestry references, and screen extents. Prefer focused events or bounded focused-object discovery. An accessibility cache may lag the visible framebuffer, so accept only a focused, visible, enabled and writable object covering the initiating tap. An ambiguous result is treated as unavailable. Browser chrome is eligible only when the focused native object satisfies the same checks. Before T7, probe address bar and ordinary contenteditable without a fixture-added ARIA role with just the allowed metadata on a real stock Chromium. Record the safe signatures and reject unknown cases. If a required case cannot be classified, stop at T6 and report that case before deciding any change to this scope or the allowed reads.

Map type from role and state when possible. For a confirmed eligible control whose role and state cannot determine the mode, the helper may receive `Accessible.GetAttributes` on the private bus, select a known `text-input-type` enum and discard the map immediately. The helper exposes only the enum, extent, and content-free identity or generation needed for invalidation. A missing or unknown type does not open a generic keyboard for a possibly sensitive field. There are no direct name, label, URL, description, text, value, selection or clipboard reads, bulk tree exports, or text-bearing event subscriptions. A helper error is reported through a fixed diagnostic without accessibility data.

Use the installed noVNC one-tap path once and take the point it actually sends, including its nearby repeat-tap adjustment. The version-matched noVNC gesture adapter reads the dispatched mouse position and display transform after noVNC handles the tap. Suppress the prompt if the position cannot be established. Query Chromium’s current focus after dispatch. When Chromium has not yet reported an eligible field at the point, retry up to four times at intervals of at least 75 milliseconds. Use the same tap generation throughout. A fresh matching response within those attempts displays the prompt without another tap; a newer tap cancels the retry. A prompt is eligible only if the reported editable bounds contain the initiating point. A previously focused field can qualify, including after the phone keyboard is dismissed. A page can cover a field without changing its accessibility state, and the prompt can then appear over the cover. The owner accepted this behavior. Rendering or hit testing is not used as proof of editable focus. The second tap remains deliberate. Focus may change after the last sample, and ordinary keys follow Chromium’s current focus. Pointer and keyboard packets go over the same ordered RFB connection. Suppress ambiguous candidates, stale replies and mismatched frame or phase identity.

Use the dispatched remote framebuffer pixel for the lookup. The canvas viewport, scaled bounds and known framebuffer size govern overlay placement. The stock browser forces unit device scale for the private helper. If its launch scale or the remote framebuffer origin cannot be verified, the helper is unavailable. Map to the owned screen coordinates and its AT-SPI device-independent geometry with the verified scale and viewport origin. Reverse that mapping when positioning the inline prompt. Unknown mappings suppress it. Tie the response to the most recent tap, active browser phase, and connected canvas geometry generation. Reject out-of-order or expired responses. A successful check issues a content-free prompt association for the sampled field and mode, with a lease of at most 500 milliseconds. Set the local expiry conservatively from the request start using a monotonic clock, so transport delay consumes the lease. Check expiry immediately before focusing the editor and before emitting newly committed keys. While the prompt or editor is active, refresh against that field about every 200 milliseconds, with at most one request in flight. A change in focus, eligibility, type, active window, phase or sampled identity invalidates the association. A change in field extent also invalidates an unopened prompt. For an unopened prompt, a temporary phase check failure disables activation. The same prompt can become active again if both checks agree before its original lease expires. Once the lease expires, discard it. An open editor instead follows the pause described below. Stop monitoring when neither is active. A late reply cannot restore an invalidated prompt. Link each request to the verified active browser. Reject an in-flight sample if its browser generation changes before the server produces the reply, even if the reply would still be fresh. Use a second authenticated request that only reads a monotonic phase number while the prompt, editor or first-tap lookup is active. Serve the phase number after origin, authentication and expiry checks and before a browser health or ownership check that waits for the handoff lock. Read only the current atomic generation. The focus lookup still verifies live browser identity. Advance that number at the start of a real phase change. The viewer immediately clears its prompt, editor and composition when it observes a new phase. A delayed success from the old phase cannot revive that generation. While the editor is open, a field can move or resize around the original tap during keyboard animation without interrupting typing. Keep requiring the sampled focused field to contain that point and its identity, eligibility, mode and phase to match. A successful reply with no eligible match at that point immediately dismisses the editor and clears pending composition, even if the field stays focused elsewhere. Temporary request failures still allow the recovery window below. Before opening, tap elsewhere, scroll, blur, disconnect or expiry discards the prompt. A change in the canvas scale or position also discards a pending lookup or its prompt, even when the framebuffer dimensions stay fixed. Polling is best effort and already emitted keys obey ordinary keyboard focus.

The second tap on a current prompt synchronously focuses a real local input inside its trusted click handler. It does not wait for a request or send another remote pointer click. Render the prompt inside the viewport and keep its target reachable in portrait and landscape.

Any viewer-facing capability uses the existing browser-viewer authentication. An editable check accepts only the expected method, browser session, origin, live browser phase and session ownership. It returns content-free metadata with cache disabled. Bound each request's time and work. No unauthenticated route, text-upload endpoint or change to service shares is needed. Authenticated concurrent viewers retain existing noVNC input behavior. Each viewer has separate pending taps, prompt and composition. A viewer’s newer tap supersedes its own older focus lookup. The independent phase reader runs alongside focus requests. A same-generation phase reply keeps the current focus request in flight.

### Type and dismiss

Show a content-free hint that typing follows the shared browser's current focus. Route committed edits through the existing noVNC key and keysym APIs. Follow noVNC's local-editor pattern. Keep the canvas blurred during local typing so it cannot send a duplicate key event. Handle composition and deletion once, clear transient text on completion or cancellation, and do not replay after an uncertain disconnect. Password-like inputs use a password control with no prediction, spelling or autocapitalization, subject to the operating system keyboard. Never copy a remote field value into the local editor or send its text to logs, tracing or storage. Keep noVNC input logging disabled.

While editing, clear unsent composition and dismiss when Chromium reports a change away from the original focus, when its phase changes, and when the browser viewer loses the connection. If a temporary phase check failure or missed focus lease leaves the same target unverified, pause input and keep the keyboard open for up to three seconds. Discard unsent composition and keys entered during the pause. Resume only after both checks confirm the original field and phase within that time. If verification does not recover, dismiss the editor. This is best-effort cancellation. Already sent ordinary keys follow the focus Chromium applies. Closing the local keyboard must leave it closed until a new prompt is deliberately tapped. Clipboard focus remains independent. Factor keyboard-induced layout changes into positioning and sizing without a focus or resize loop.

### Packaging and recovery

Keep the current noVNC release and license notices. Add the automated helper, stale-response and viewer tests to the existing remote-gui browser CI job and install any real helper prerequisites there. Native OS keyboard proof remains a separate physical check. Use existing packaged dependencies and document any additional optional host prerequisite before treating the feature as available. The README and installed instructions name iPhone Safari as supported for this release and identify Android Chrome as deferred. Missing or failed helpers suppress the feature and clean up only task-owned resources. Updating the package affects new sessions. An older running session continues under its existing supervisor, and reverting the package does not migrate profiles or replay text. A running new supervisor remains responsible for its live helper until it stops or expires. New sessions started after reverting use the prior package.

## Acceptance Criteria

- [ ] AC-10: The first tap on a supported writable remote field sends one remote click and the inline prompt is shown with the keyboard closed. With unchanged remote focus, typing uses the caret placed by that click. The second tap opens the native phone keyboard without another remote click. Taps outside the reported editable bounds, unverified or expired prompts and observed invalidations give no keyboard. The viewer has no toolbar keyboard control.
- [ ] AC-11: The native keyboard can type, compose and delete through existing noVNC input. Each committed codepoint and deletion maps to the expected ordinary remote keys without duplication. An observed focus change or disconnect clears pending composition. During temporary verification loss, an open keyboard pauses input and can resume on the same field and phase without replaying discarded edits. The viewer explains current-focus typing and preserves hardware input and Clipboard focus.
- [ ] AC-12: Phone keyboard animation, dismissal, orientation, adaptive sizing and reconnect leave the viewer usable. After dismissal a new intentional two-tap sequence is needed to open it. Before opening, a change in canvas scale or position invalidates the current prompt and its pending lookup.
- [ ] AC-13: Human browser mode is sandboxed with automation, debug transport and extensions disabled. Private metadata cannot cross session identities, and field content and text-bearing accessibility data stay outside the helper output, viewer metadata and logs.
- [ ] AC-14: The independently installed remote-gui package uses the existing noVNC assets and licenses. Desktop viewing, pointer, hardware keyboard, resizing, Clipboard, handoff and service shares still work. Missing helpers leave a usable viewer and cleanup only owned processes, including on stop, expiry or rollback. The package instructions identify iPhone Safari support and the deferred Android Chrome verification.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-10 | In a disposable independently installed remote-gui package at the candidate implementation commit, record package identity, noVNC version, and the iOS version of the physical iPhone running Safari. On the iPhone, use the physical fixture to observe a closed keyboard and visible prompt after the first tap, the caret in a seeded text input and the native keyboard after the second. In the real RFB browser regression, count pointer packets for each tap and compare the caret and exact inserted text in the stock remote page. Require one press and release on the first tap and zero on the prompt tap. Type synthetic text in text, password, textarea and ordinary contenteditable without a fixture-added ARIA role; include the nested cross-origin target and harmless address-bar edit. Inspect the toolbar for absence of a keyboard button. Test background, readonly and disabled targets outside any eligible reported focus. Cover a field without moving its reported focus. With eligible reported bounds and mode, assert that the first tap shows the prompt with the native keyboard closed and that the deliberate prompt tap opens it. Delay a click to a different field, reorder metadata, and tap adjacent fields inside the noVNC double-tap window. Test nearby repeat taps on both sides of a field boundary. Keep the same gesture type and trigger noVNC’s snap within its timing and distance thresholds. Measure both the raw and emitted points and require that they land on opposite sides of the same eligible bounds, in both directions. In both directions, hold the preceding tap’s metadata until after the repeat while preserving noVNC tap history. Require no prompt before the repeat. Show that a response for the repeat tap determines the outcome. Require a new prompt when the emitted point is inside and no prompt when it is outside. Interrupt phase checks while a prompt is visible. Verify that tapping it during the interruption cannot open the keyboard. Restore both checks before its original lease expires. Tap the same prompt without another field tap and require the keyboard to open. In a separate run, let the lease expire and verify a late reply cannot restore it. For the delayed different-field click, assert that the earlier focus gives no prompt. Release the click during the bounded retry and require a prompt for the new matching focus without another field tap. Delay a repeat click with the pointer already at the point and the caret elsewhere in the same field. If the prompt is usable while the click is buffered, activate it and queue a key. Otherwise release the click and then activate the prompt. Both paths must show that the first edit uses the caret placed by that click with unchanged focus. |
| AC-11 | On the physical iPhone in Safari, verify native text input with ASCII `z`, accent `é`, the two-codepoint string `é`, and a supplementary-plane character such as `😀`. Prepare U+0065 U+0301 in a disposable local note or the test runner and insert it with the native Paste action in the opened Safari editor. Compare the remote field’s codepoints with the scripted expectation. Also send those sequences through the deterministic real RFB browser regression and count matching frames. Each committed codepoint must produce one matching press/release pair and the expected synthetic text. Backspace produces one pair and deletes the intended character. An IME preedit produces no traffic until commit and cancellation leaves the field unchanged. Inspect keyboard hints and password prediction, spelling and capitalization settings. While the prompt is visible, move focus in the page or change the field type to password on the same node. During composition, let a second authenticated viewer move focus. Require detection to dismiss and discard unsent data. Interrupt focus monitoring during composition with RFB still connected, then deliver a late successful reply. Require expiry, cancelled composition, zero late traffic and no prompt resurrection. Separately disconnect during composition and verify no edit is replayed after reconnect. Count hardware and Clipboard emissions separately. In the browser regression, interrupt each focus and phase route while the editor is open. Check that it stays open during the pause, that edits made during the pause emit no RFB keys, and that revalidation of the same field and phase resumes typing without replay. Keep verification unavailable through the three-second limit in a separate run and check dismissal. |
| AC-12 | On the physical iPhone in Safari, rotate portrait to landscape, open and dismiss twice, scroll a low field and form action into view, use Clipboard while a prompt is visible, and reconnect. Check native keyboard visibility, visible controls, canvas geometry and no focus loop. In the animation test, move or resize the focused field while it still covers the initiating point and keeps its eligibility, focus, mode and phase. Verify the open editor stays active and sends one subsequent edit. Then move the same focused field off the original point. A successful no-match must dismiss the editor and discard pending composition. Require zero further keys until a fresh two-tap sequence at the new position. Move the focused field without resizing the canvas and require the old prompt to close. Hold a valid response past the lease and prove it cannot display the prompt or reopen the keyboard. Exercise an offset, scaled canvas and ensure click, remote field and prompt agree. Keep the framebuffer dimensions fixed. Change canvas scale and canvas position in separate cases, each with a pending reply and with a visible prompt. For each pending case, release an otherwise valid reply inside its original lease and verify no prompt appears. For each visible case, require dismissal before expiry. In each case verify that a fresh tap maps to the field. Remove or vary the verified host unit-scale precondition and prove the helper refuses the unknown mapping. Hold a valid focus response while the unchanged phase route replies. Release it inside its lease and require it to display or renew the prompt. Leave an unchanged prompt visible beyond the first lease while successful samples renew it. Tap it, leave the editor open beyond its original lease, and verify one later commit. Exercise keyboard-sized viewports and desktop regression cases in Chromium and Firefox. |
| AC-13 | Hold a real browser handoff open after the phase advances while an old focus sample is pending. Query the actual authenticated phase route and require the new number before releasing either hold. Apply the method, origin, owner identity and expiry negative cases to that route as well as the focus route. Run the live handoff with the editor open and composition pending. Release the held old-phase reply after handoff and verify the viewer cannot restore the old prompt, editor or composition. Separately block a helper result during a deterministic generation change and release it before 500 milliseconds expire. Verify the server rejects it. In a separate deterministic check, leave the same RFB connection alive with the local editor open and a composition pending. Hold its current focus response and change the independent authenticated phase reply. Observe the editor and composition clear, then deliver the otherwise successful old-phase response and a late composition commit before the original lease expires. Record the lease deadline and delivery times without renewal. Require no restored prompt or editor and zero queued keys. Require no stale keys in the replacement Chromium, then prove a new two-tap edit through the same viewer connection. Inspect real stock Chromium launch, private publisher validation and cleanup. Exercise the real endpoint with wrong origin, method, identity, expired session, stale generation and wrong publisher. Trace permitted synthetic D-Bus methods and event subscriptions during startup, lookup, invalidation and failure, with no production inputs. Fail on text-bearing/cache subscriptions, direct content reads, map reads for rejected or unambiguous fields, or a sentinel outside the eligible verified publisher’s single private attribute reply. Verify only safe metadata reaches the viewer and no text enters logs. |
| AC-14 | Run module, installed-copy and physical checks on the same package candidate and run the real Chromium and Firefox regression suite. Exercise missing helper and partial start, normal stop and expiry. In an isolated installation start the prior package, upgrade to the candidate and start a new session. Confirm that the original viewer still works with its original supervisor and browser session. Then revert to the prior package while the new session remains live. Verify the reverted package gives prior behavior for new sessions and that the still-running candidate supervisor cleans up its own helper on stop or expiry. Read README and skill instructions against the installed behavior. Check both name iPhone Safari support and defer Android Chrome verification. |

## Tasks

- [x] T6 `plugins/remote-gui/internal/browser/`, `plugins/remote-gui/internal/proxy/`, and `tests/remote-gui/` - start with a failing real stock Chromium helper probe for the required editable focus and mode signatures, reported-focus overlay behavior and the negative privacy call assertions. Add the private helper only when the installed stack passes the feasibility proof (AC-10, AC-13).
  Evidence: `REMOTE_GUI_MOBILE_E2E=1 bun test tests/remote-gui/mobile.e2e.test.js` passed on Chrome 157.0.8103.50 and noVNC 1.6.0. The fixture checked the reported modes, readonly and disabled fields, ordinary contenteditable without an added role, and a covered field that kept focus. The private bus monitor rejected an extra call in a disposable control build and found only the allowed helper methods in the candidate. The monitor checks method names during field lookup and retains no reply bodies. The full lifecycle and privacy checks in AC-13 are still open.
- [x] T7 `plugins/remote-gui/internal/proxy/`, `tests/remote-gui/` and `.github/workflows/ci.yml` - record failing browser cases for the absent prompt, metadata expiry, mode change and duplicate keys. Implement the prompt and local input and run those cases against the real helper in the browser CI job (AC-10, AC-11, AC-12).
  Evidence: The stock Chromium test holds a focus reply past expiry and checks that it cannot restore the prompt. It also switches a focused field from text to password and back and checks that each old prompt closes. Both checks failed on disposable copies with the corresponding guard removed and passed locally on Chrome 157.0.8103.50 and noVNC 1.6.0. In a separate Chromium control with deterministic focus replies, duplicating one synthetic key failed the single-key assertion. The [hosted remote-gui job](https://github.com/michielvha/vh-adlc/actions/runs/44815048311/job/136561078287) on `66c737bc` ran the enabled `bun test tests/remote-gui/mobile.e2e.test.js` case and passed. The case exercised the absent prompt, expiry, input mode changes, and a single delivered edit through the real helper.
- [x] T9 `plugins/remote-gui/internal/proxy/mobile.js` and `tests/remote-gui/` - reject pending and visible prompts when viewer canvas scale or position changes at a fixed framebuffer size. Prove a fresh tap after the change and native-editor continuity while the verified field moves around the initiating point, followed by dismissal on a successful no-match when it moves away. Record the per-tap pointer and per-edit key frames in the real browser regression using synthetic input (AC-10, AC-11, AC-12).
  Evidence: The live browser test on stock Chrome 157.0.8103.78 and noVNC 1.6.0 failed against the previous package because the visible prompt survived a canvas offset change. The rebuilt package passed separate scale and position changes with pending and visible prompts at a fixed framebuffer size. The same run verified one field click, no pointer packet from the inline prompt tap, the caret on a seeded field, exact Unicode and Backspace key pairs, and continuity or dismissal on the two field-motion cases. The remote-gui browser and proxy race tests, vet, module tidy check and all eleven package checks passed.
- [x] T10 `tests/remote-gui/mobile.e2e.test.js` - reproduce the Chrome 157 address-bar failure and verify a real two-tap address-bar edit in a controlled Chromium tab, including temporary verification failures (AC-10, AC-11).
  Evidence: [The first hosted Chrome 157 run](https://github.com/michielvha/vh-adlc/actions/runs/45430242708/job/138573219612) and [its successor](https://github.com/michielvha/vh-adlc/actions/runs/45450550796/job/138646324945) failed after a focused address-bar sample followed by no match. The failed screenshot showed Google Search open before the prompt. A controlled bootstrap uncovered a separate test setup error: Chrome restored the existing URL and the sent keys inserted into its middle. The regression now establishes a local page before the tap, returns focus to that page and lets the actual browser select the URL on the first tap. Three successive enabled live runs passed on Chrome 157.0.8103.78 and noVNC 1.6.0, including temporary endpoint failures, URL correction and viewport restoration.
- [ ] T8 `tests/remote-gui/`, `plugins/remote-gui/README.md` and the feature document - run the physical checks against the independent package, record exact device and package versions, and demonstrate prior-package rollback and cleanup (AC-10, AC-11, AC-12, AC-13, AC-14).
  Partial evidence: A disposable installation built remote-gui 0.4.0 from `66c737bc` with Chromium 156.0.8078.79 and noVNC 1.5.0. A session from `84e59c89` remained usable after upgrading. The candidate session stayed connected after rollback, and a new session used the prior package. Stopping the candidate cleaned up its session while the other two stayed connected. Forcing the optional D-Bus daemon to exit left the viewer and Clipboard usable, with the mobile lookup unavailable and no typing prompt. The private iPhone test on iOS 27.2.1 reached Xcode preflight and waited for unlock. The Android device was absent from USB and wireless debugging. The earlier phone results are for earlier builds.
  On 2026-11-21, the owner used Safari on the iPhone 15 Pro Max with iOS 27.2.1 to test the private viewer from `66c737bc`. The owner confirmed that the second tap opened the native keyboard. The remote field recorded four edit events and its exact single-character assertion remained open. Two wireless XCTest attempts timed out while enabling UI automation before Safari opened.
  The next two Xcode runs reached Safari on the same iPhone. The first tap focused the remote field, but neither run displayed the typing prompt. An isolated trace found that the accessibility tree walk exhausted its budget even though the platform's focused-state query found the field. The helper now keeps one private bus connection and uses that query to select a unique candidate before checking its state, bounds, and input mode.
  The repaired remote-gui 0.4.0 package (SHA-256 `f01a82530d92d447aed3aebf6fbdad99e06851d290baca8f8f94428a02197589`) passed the physical Safari test on the iPhone 15 Pro Max with iOS 27.2.1, stock Chromium 156.0.8078.79 and noVNC 1.5.0. The keyboard stayed closed after the first field tap, opened after the second tap on the inline prompt, and the remote field received exactly one edit with the expected `z`. The private session stopped after the run. The enabled Chromium and noVNC browser regression also passed against this package, including a remote address-bar edit and the private bus call check. The rest of the physical matrix remains open.
  On 2026-11-24 the rollback and cleanup sequence ran again on this same candidate. The Fedora host built the copy from `9bf555a3` into a private cache and got the same binary SHA-256 `f01a8253`. The prior package came from `origin/main` (`e813e83b`). In one isolated home, a prior session A and a candidate session B started, then a prior session C started while B stayed live. `tests/remote-gui/mobile-physical/viewer-check.mjs` opened all three from desktop Chromium on the Mac with touch emulation. Each canvas drew. Only B requested the mobile module, and none showed a keyboard button. Killing B's private bus left its viewer drawing. Stopping B removed all of its processes, including the orphaned focus worker, while A and C stayed connected. A two-minute candidate session left no process after expiry. Through `tests/remote-gui/mobile-physical/start.sh`, a desktop hardware keyboard loaded the synthetic fixture in the remote Chromium. It logged one keydown and one keyup per key. Android Chrome and the remaining iPhone cases are still open.
  On 2026-11-26 the independently installed 0.5.0 package from `24ffd0b6` (binary SHA-256 `c4018076c2362cd7d45cea390468f7449ef623893d6de80318c18c924f18e92d`) preserved a prior 0.4.0 session during upgrade. The candidate viewer stayed connected after rollback, and stopping it left both 0.4.0 viewers connected. In a separate test the candidate viewer and Clipboard stayed available after its owned focus worker exited. The session expired automatically with none of its recorded child processes still running. A disposable browser-module probe rejected a focus sample released after the browser phase advanced. Its negative control accepted that sample when the phase comparison was removed. Xcode still reported the paired iPhone unavailable for native verification of this package.
  Later that day, Xcode reconnected to the physical iPhone 15 Pro Max (iOS 27.2.1) over Wi-Fi. Safari ran the native key test against the same 0.5.0 binary, with stock Chromium 156.0.8078.79 and noVNC 1.5.0. The first field tap showed the inline prompt and left the keyboard closed. The second tap opened the native keyboard. The test tapped Z, A and Backspace directly on the keyboard. The remote fixture recorded three edits, including one delete, and ended with exactly `z`. The keyboard stayed open through Backspace, dismissed on a canvas tap, and reopened after rotation to landscape and after opening the viewer URL again in portrait. The first test attempt used XCTest's text-entry shortcut and failed when it tried to generate Backspace after sending both letters. The direct-key run passed and the private viewer stopped. The remaining physical acceptance cases stay open.

## Open Questions

None. The owner approved the reported-focus option after the warm-cache overlay test. The shipped prompt can follow a focused field even when page content covers it.
## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-19 | R-1 | spec | `363a6140f6c2a1383da8d9c1fee5f2d3c36fa0fa` | unknown | procedural | Three should-fix findings preserved; applied in the subsequent owner-directed revision, awaiting a new independent review. |
| 2026-11-19 | R-2 | spec | `3fa0bae68d8c1d25d9255c2d90cd1ec0b9d06886` | unknown | procedural | No findings; model identity was not attested. |
| 2026-11-19 | R-2 | spec | `3fa0bae68d8c1d25d9255c2d90cd1ec0b9d06886` | n/a | n/a | accepted by owner |
| 2026-11-19 | R-3 | spec | `0708e3cb33dd1fe1e85f4e8da74b598ee32f96a0` | unknown | procedural | No findings after covered-source drift; model identity was not attested. |
| 2026-11-19 | R-4 | spec | `d3fad7181862b2bee55f7cb981745b8057333b50` | gpt-6.2-sol | procedural | One blocking finding and two should-fix findings. Independent synthetic mode probe confirmed. |
| 2026-11-19 | R-5 | spec | `5168c70da624c76d87a4de41dd39c744a61c53e0` | gpt-6.2-sol | procedural | No blocking or should-fix findings. One Context nit. |
| 2026-11-19 | R-5 | spec | `5168c70da624c76d87a4de41dd39c744a61c53e0` | n/a | n/a | accepted by owner |
| 2026-11-19 | R-6 | spec | `77d28a4e94817bd1e51113c5839736f784cc3f30` | unknown | procedural | Eight should-fix findings and one Context nit. Model identity was not attested. |
| 2026-11-19 | R-7 | spec | `a03bf98503d8c377eaed65e2ebf51577c4483a39` | unknown | procedural | Six should-fix findings and one evidence-link nit. Model identity was not attested. |
| 2026-11-19 | R-8 | spec | `a668b87a40c01d15880c890f6857969706d26148` | unknown | procedural | One blocking finding, six should-fix findings and one nit. Model identity was not attested. |
| 2026-11-19 | R-9 | spec | `39b5042cb63aa553818ee2fe56f9605b6cefff23` | unknown | procedural | Four should-fix findings and one evidence nit. Model identity was not attested. |
| 2026-11-19 | R-10 | spec | `ad01fed9eb16e0083875c61be063160e444cf3f6` | unknown | procedural | Four should-fix findings and one fixture wording nit. Model identity was not attested. |
| 2026-11-19 | R-11 | spec | `f54bb1ad8854cfd80f03c73cdd12127a784e0f38` | unknown | procedural | Two should-fix test proof findings. Model identity was not attested. |
| 2026-11-19 | R-12 | spec | `37ca8edd45f4d40bfd7ffd547f6a85b5abe648ed` | unknown | procedural | Two should-fix proof findings. Model identity was not attested. |
| 2026-11-19 | R-13 | spec | `19f606adb87ed597d6bb5e472709129334debd62` | unknown | procedural | Three should-fix phase-path proof findings. Model identity was not attested. |
| 2026-11-19 | R-14 | spec | `06f91bd54a0adb348f68fd27ac36928326df1894` | unknown | procedural | No findings. Model identity was not attested. |
| 2026-11-19 | R-14 | spec | `06f91bd54a0adb348f68fd27ac36928326df1894` | n/a | n/a | accepted by owner |
| 2026-11-21 | R-15 | spec | `cb08d97a3c436b8c4ea9f61f0120e3acb2544781` | unknown | procedural | Covered drift review found one factual nit in test evidence. Model identity was not attested. |
| 2026-11-22 | R-16 | spec | `edc803664df47d93618462073a17537cbf01cd22` | unknown | procedural | Three should-fix findings and one factual nit. Model identity was not attested. |
| 2026-11-22 | R-20 | spec | `62c95df927cbc33fa180f7f5c604b64b6039848c` | unknown | procedural | Three should-fix findings on recovery and geometry verification. Model identity was not attested. Originally recorded as R-17 on the local branch. |
| 2026-11-22 | R-21 | spec | `413ea2344b0a3b070d4ff6a1a3af47083676a73c` | unknown | procedural | No findings. Model identity was not attested. Originally recorded as R-18 on the local branch. |
| 2026-11-24 | R-19 | spec | `ee6ac65605a4c8ca44ef5b8610472f7eb6c05c87` | claude-opus-5-5 | procedural | Covered drift review found three nits and nothing blocking; acceptance kept. |
| 2026-11-26 | R-22 | spec | `8ca748e583633eed22c6b6b39fc13f81f40d32b2` | unknown | procedural | Three should-fix findings and a nit. Model identity was not attested. |
| 2026-11-26 | R-23 | spec | `2f3f9781effc920bf4f023a66285be63fdef7e80` | unknown | procedural | One should-fix finding on confirmed no-match behavior. Model identity was not attested. |
| 2026-11-26 | R-24 | spec | `46f06958b1f582f4b4be2c7d3a3d0200fbdf5eb4` | unknown | procedural | No findings. Model identity was not attested. |
| 2026-11-26 | R-24 | spec | `46f06958b1f582f4b4be2c7d3a3d0200fbdf5eb4` | n/a | n/a | accepted by owner |

### R-1

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Scope (preserve desktop pointer and hardware-keyboard input); Design / Input and geometry boundaries (ordinary pointer transport, context invalidation, focus acknowledgement and active controlling viewer); Design / Editing and viewport behavior (remote field changes); Acceptance Criteria AC-06; Test Plan AC-06
EVIDENCE: The document keeps ordinary RFB pointer transport at line 73, acknowledges the selected field before sending text at line 79, and restricts editing bindings to an undefined active controlling viewer at line 81. In the cited source, browser.go:570-571 launches x11vnc with -shared, and viewer.go:201-202 at 417c4c4 creates each RFB client with viewOnly=false. The sizing controller arbitrates viewport requests, not RFB pointer or hardware-keyboard events. The design does not say how a second viewer's ordinary click or key event participates in the binding transaction, or how input already authorized for field A is prevented from following such an event to field B. Implementers could preserve unrestricted RFB control or gate it behind the new controller, with different desktop behavior and different guarantees. Scenario S6 races adapter/transport fixtures but does not require this real ordinary-input path.
PROPOSAL: Define controller acquisition and transfer, and how ordinary RFB pointer and hardware-keyboard events invalidate or participate in an editing binding before another edit can apply. Add a real two-viewer case that changes focus through RFB while the first viewer has acknowledged and in-flight input; require either delivery to the original bound target or cancellation, with no delivery to the other field.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Scope (field-appropriate keyboard modes); Design / Input and geometry boundaries (safe input-mode flags); Design / Editing and viewport behavior (secure password semantics); Acceptance Criteria AC-02; Test Plan AC-01, AC-02 and AC-08
EVIDENCE: Scope line 47 and AC-02 require text, email, URL, search, telephone and numeric keyboard modes. Design line 85 also requires password input without prediction, capitalization or spelling suggestions. Gate F1 checks keyboard opening and caret placement across these field types, while M2 compares resulting text and only names password and numeric/email modes. No proof explicitly observes the URL, search or telephone keyboard modes or the password suggestion settings. A bridge that always uses a generic text editor for these fields could satisfy the stated opening and text-result checks while failing the required native keyboard behavior.
PROPOSAL: Extend the real-device procedure to verify each required input mode and the password editor's secure behavior, including transitions between field types while the keyboard is already open. State the observable pass condition for each accepted OS/browser/keyboard combination and retain any unsupported mode as a failure requiring a scope decision.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design / Input and geometry boundaries (metadata and input access checks); Acceptance Criteria AC-05; Test Plan AC-05, AC-06 and AC-08
EVIDENCE: Design line 81 applies session identity, origin, method, expiry and process ownership checks to both metadata and input access, and AC-05 covers all new routes. S5 explicitly exercises actual metadata routes with adversarial identities and headers, but does not exercise the actual input/binding routes under those conditions or include wrong-method requests. S6 uses deterministic adapter/transport fixtures for delivery races. An implementation that protects metadata correctly but omits a required check on an input or binding endpoint could therefore pass the specified security procedures.
PROPOSAL: Apply the actual-route security matrix to every metadata, binding, input and controller endpoint the probe introduces, including wrong methods, wrong origins, forged ingress headers, foreign identities, expired sessions and changed process ownership. Assert both refusal and zero remote input or binding mutation for each rejected request.

### R-2

NO FINDINGS

### R-3

NO FINDINGS

### R-4

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Context / First feasibility run, Design / Metadata, privacy and viewport behavior, Test Plan / AC-05 Scenario S5
EVIDENCE: At d3fad718, Design permits the verified private helper to receive the raw Chromium attribute map over AT-SPI D-Bus. S5 requires that the raw reply and unrelated attributes never appear in IPC. The allowed D-Bus reply is IPC. The reviewed fixture calls GetAttributes, confirms that a synthetic page-authored attribute arrived, and then emits only the selected keyboard type. A correct implementation necessarily fails the unqualified IPC rule.
PROPOSAL: Name the one allowed inbound Chromium-to-helper D-Bus exchange in S5. Require that the raw response and unrelated attributes never leave the helper, appear on other channels, or reach retained output, and verify the inbound recipient is the verified session helper.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Context / First feasibility run, Design / Metadata, privacy and viewport behavior, Test Plan / AC-05 Scenario S5
EVIDENCE: Design limits GetAttributes to verified eligible controls whose role and state do not identify the required keyboard mode. S5 says to allow it for verified eligible controls and checks only the emitted result. An implementation that reads the full map for every eligible control would pass those checks even when safe metadata already supplies the mode. The reviewed fixture demonstrates a multiline control that can be classified without the map.
PROPOSAL: Add a call-level assertion that GetAttributes is absent for an eligible control with sufficient role and state. Keep the synthetic unrelated-attribute check for a verified eligible control that actually needs the lookup.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Context / First feasibility run, Design / Reuse existing noVNC capabilities first, Design / Input ownership and field binding, Test Plan / AC-09 Scenario U9
EVIDENCE: Design permits the smallest enforcing adapter if x11vnc cannot supply trusted client attribution or a transfer barrier. U9 requires proving native client attribution and a synchronous disable, drain and re-enable barrier without saying how that requirement changes when the native evaluation fails. Context records that the permission command leaves a held button down. A reviewer could read U9 as rejecting an enforcing adapter that proves the full transfer without relying on native client IDs.
PROPOSAL: Require the native evaluation and its recorded result in every case. Require native client attribution where the chosen implementation relies on it, and test the complete transfer barrier through whichever enforcement path is delivered.

### R-5

FINDING: F-01
KIND: factual
SEVERITY: nit
WHERE: Context / Owner summary, Context / Resizing prerequisite after merge
EVIDENCE: At 5168c70d, lines 31 and 51 describe the R-2 acceptance as still settling the scope and the normative baseline as unchanged. Those were true when R-3 ran. The document is now draft and revises Design, AC-05, and the Test Plan. The same historical paragraphs describe the work as spec-only and say no feasibility probe had started, while the First feasibility run records one.
PROPOSAL: Frame both paragraphs as historical checkpoints before the metadata revision. State that R-2 acceptance applied to the baseline R-3 checked and that the revised baseline awaits acceptance.

### R-6

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary (line 23); Scope (lines 109-110); Design / Detect and show the prompt (lines 118, 122); Acceptance Criteria AC-10; Test Plan AC-10 and AC-11
EVIDENCE: Sending a click on the RFB WebSocket before making a metadata request does not establish that Chromium processed the click before the helper sampled focus. An already-focused field can also retain focus beneath a nonfocusable overlay. AT-SPI's VISIBLE and SHOWING states describe potential exposure, so focus and bounds containment can still match that covered field. Installed noVNC 1.5.0 core/rfb.js:1226-1254 can also snap a rapid nearby tap to the previous tap's position, so the viewer's raw tap and the dispatched click can differ. The delayed-response case checks ordering between viewer requests and does not cover these paths. [AT-SPI state definitions](https://gnome.pages.gitlab.gnome.org/at-spi2-core/libatspi/enum.StateType.html)
PROPOSAL: Specify how the helper confirms that its sample follows the dispatched click and matches the actual hit, and suppress the prompt if it cannot make that determination. Exercise an already-focused field under an overlay, a click delayed on the RFB path, and rapid taps on adjacent targets while preserving stock gesture behavior.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary (lines 25-27); Scope (lines 109-112); Design / Detect and show the prompt (lines 118-124); Design / Type and dismiss (lines 128-130); Acceptance Criteria AC-10, AC-11 and AC-13; Test Plan AC-10, AC-11 and AC-13
EVIDENCE: Line 124 defines a request for a tap. Line 130 requires dismissal when Chromium reports a focus change, but does not specify how the viewer observes it after that request completes. Line 122 also omits remote focus and eligibility changes from the prompt invalidation list, even though it requires a still-current prompt. At 77d28a4e, plugins/remote-gui/internal/proxy/viewer.go:198-207 has no remote-focus notification path. A page or another authorized viewer can change focus while the prompt is open, and a focused node can change from text to password without changing its identity. The current test plan checks stale replies and a change while composing but leaves those prompt and mode transitions untested.
PROPOSAL: Define bounded content-free invalidation while the prompt or editor is active, including what happens when monitoring fails or a phase changes during a pending check. Test a page-driven focus move between taps, a sensitivity change on the same node, and a second authorized viewer moving focus during composition, preserving the owner's ordinary current-focus typing rule for keys already sent.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary (line 27); Context / Evidence from the first design (lines 37-39); Scope (line 109); Design / Detect and show the prompt (lines 118-120); Acceptance Criteria AC-10; Test Plan AC-10 and AC-11
EVIDENCE: Scope requires contenteditable and the native address bar while Design suppresses the prompt when it cannot classify the input safely. The metadata probe at tests/remote-gui/mobile-feasibility/editable-metadata.py:141-164,191-209 classifies seven HTML inputs and one textarea. It supplies no allowed signature for either required target. Chromium 156.0.8078.79 omnibox_view_views.cc:236-250 configures a generic editable text-field role and adds a URL HTML attribute. AXPlatformNodeBase uses a separate kInputType string attribute for text-input-type. The source and existing probe do not establish which allowed metadata safely classifies those targets in the installed Linux browser. [Chromium omnibox](https://raw.githubusercontent.com/chromium/chromium/156.0.8078.79/chrome/browser/ui/views/omnibox/omnibox_view_views.cc), [Chromium platform attributes](https://raw.githubusercontent.com/chromium/chromium/156.0.8078.79/ui/accessibility/platform/ax_platform_node_base.cc)
PROPOSAL: Require an early stock Chromium check of the actual allowed signatures for native address and contenteditable controls before building the phone flow. Identify the safe classification for each or return the uncovered case to the owner without broadening the allowed reads.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary (line 27); Context / Evidence from the first design (line 39); Design / Detect and show the prompt (lines 118-124); Acceptance Criteria AC-13; Test Plan AC-13
EVIDENCE: Line 120 permits GetAttributes only when role and state are insufficient and bans text-bearing subscriptions and bulk tree exports. AC-13 inspects calls and one marker, but does not explicitly require the negative assertions that distinguish these limits. The existing probe at tests/remote-gui/mobile-feasibility/editable-metadata.py:191-209 reads the map for password and number even though line 37 records distinguishable signatures. It can pass its marker assertion with those extra reads. A generic AT-SPI client can also obtain names and descriptions through the cache, without calling a direct name or description method. [AT-SPI cache adaptor](https://raw.githubusercontent.com/GNOME/at-spi2-core/main/atk-adaptor/adaptors/cache-adaptor.c)
PROPOSAL: Require call and subscription assertions during startup, lookup, invalidation and failure. Check that an unambiguous field and rejected candidates cause no GetAttributes call, that only a verified eligible ambiguous field can supply the sentinel-bearing map on the private bus, and that no text-bearing cache traffic reaches the helper or sentinel data leaves it.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary (lines 23, 29); Design / Detect and show the prompt (line 122); Design / Packaging and recovery (line 134); Acceptance Criteria AC-10 and AC-14; Test Plan AC-10 through AC-12 and AC-14; Tasks T8
EVIDENCE: The Owner summary promises the actual packaged viewer on both phones. AC-10 starts a source-built session and AC-14 runs the installed-copy checks separately, so the two passes could exercise different runtime artifacts. AC-10 also does not count pointer delivery or explicitly inspect the toolbar. A viewer could click the remote field again when the prompt is tapped or retain a toolbar keyboard control and still produce the named keyboard and text observations.
PROPOSAL: Run the physical Safari and Chrome procedures against the independently installed package built from the reviewed implementation, and retain the package identity and device/browser versions with the results. Explicitly verify one remote click on the first tap, zero on the prompt tap, and absence of a toolbar keyboard control.

FINDING: F-06
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary (line 25); Design / Type and dismiss (lines 128-130); Acceptance Criteria AC-11; Test Plan AC-11 and AC-12
EVIDENCE: AC-11 requires exactly one operation but the proof calls for an exact event and value without saying whether it counts a local commit, an RFB key pair, or a remote input event. Installed noVNC core/rfb.js:459-484 sends one keysym at a time. A committed multi-codepoint value can legitimately yield multiple remote events. The proof also names an observed focus cancellation and a reconnect but never requires a disconnect during a pending composition or checks that the pending input is absent after reconnect.
PROPOSAL: Define expected final text and key or input sequences for the named operations, including a specified multi-codepoint string, so the check detects loss and duplication without requiring a remote IME transaction. Exercise disconnection with a composition pending and require no late input or replay on reconnect.

FINDING: F-07
KIND: factual
SEVERITY: should-fix
WHERE: Design / Packaging and recovery (line 134); Acceptance Criteria AC-14; Test Plan AC-14; Tasks T8
EVIDENCE: AC-14 requires cleanup on rollback. Its proof covers partial failure, stop, expiry and an older supervisor continuing beside a new session, but never reverts the package. The existing compatibility fixture in tests/remote-gui/legacy.e2e.test.ts:12-41 starts 0.3.0 under its own runtime and accesses it with the current CLI. It does not exercise reverting the new package with the new helper present.
PROPOSAL: Add a disposable upgrade and rollback case from the supported prior package. State which supervisor owns a still-running helper across the rollback, then check that stopping or expiring that session removes only its resources and that new sessions use the prior behavior.

FINDING: F-08
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan AC-10 through AC-14; Tasks T6-T8; frontmatter covers
EVIDENCE: The pinned frontend-testing standard requires applicable automated browser checks in CI, and the pinned feature-document standard orders tasks with the failing test first. T6 and T7 put code and proof in the same task and do not name a failing-first check. No task or proof names the browser CI path. At 77d28a4e, .github/workflows/ci.yml:137-159 enumerates existing browser suites and the GUI prerequisites. Adding a new opt-in mobile suite or depending on an optional helper would leave that suite or its real helper path unexecuted unless the affected CI path changes.
PROPOSAL: Plan failing-first checks for the new helper and viewer behavior and name how the applicable automated cases and prerequisites enter the existing browser CI job. Keep native OS keyboard proof on the two physical phones.

FINDING: F-09
KIND: factual
SEVERITY: nit
WHERE: Context / Physical iPhone gesture probe (line 49); Context / Physical Android gesture probe (line 55); Context / Remote field binding feasibility (line 63); Context / Existing mobile viewers (line 87); Sources (line 250)
EVIDENCE: These passages refer to open T1, AC-01, controller transfer and accepted first-tap field binding in the present tense. Scope at line 112 retires those requirements and line 89 describes the first design as historical. The current tasks and criteria start at T6 and AC-10.
PROPOSAL: Date or otherwise mark the old gate references and conclusions as historical, preserving their observed results and limits.

### R-7

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary (lines 23, 27); Context / Two-tap feasibility fixture (lines 33-35); Scope (lines 115-116); Design / Detect and show the prompt (lines 124, 128); Acceptance Criteria AC-10; Test Plan AC-10; Tasks T6
EVIDENCE: The R-6 revision adds a fresh AT-SPI call as evidence that the click hit the focused field. Chromium 156.0.8078.79 routes the Linux component hit through `HitTestSync`, which uses `CachingAsyncHitTest` for web content. Chromium documents that the synchronous result can be an approximate bounds match or a previous renderer hit while the new renderer request is outstanding. A newly covered, still-focused field can therefore match immediately after a fresh D-Bus call. The successful static fixture and the single overlay scenario do not distinguish a current renderer result from an old one. [Linux component implementation](https://github.com/chromium/chromium/blob/156.0.8078.79/ui/accessibility/platform/ax_platform_node_auralinux.cc#L4155) [Browser hit-test delegate](https://github.com/chromium/chromium/blob/156.0.8078.79/ui/accessibility/platform/browser_accessibility.cc#L1135) [Chromium hit-testing design](https://chromium.googlesource.com/chromium/src/+/90f68b6bda019ed49895b274cbb151bb6b3cc541/docs/accessibility/browser/how_a11y_works_3.md#hit-testing)
PROPOSAL: Make a warm-cache test with a newly overlaid, still-focused field part of T6. Define how the stock-browser check establishes current hit evidence and suppresses the prompt if freshness remains uncertain.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary (line 23); Design / Detect and show the prompt (lines 128, 132); Acceptance Criteria AC-10 and AC-12; Test Plan AC-10 and AC-12; Tasks T6
EVIDENCE: The R-6 revision accepts an already-focused field based on an X11 pointer snapshot and a matching accessibility hit. When the pointer starts at the tapped coordinate with Button 1 released, those checks can pass before the RFB press or release arrives. For example, the caret can move by keyboard while the pointer remains at the spot the user taps again. Installed noVNC 1.5.0 `core/rfb.js:1226-1254` emits a move, press and release, while line 128 checks the resulting pointer state and explicitly allows unchanged focus. AC-10 delays a click only to a new field, where the new-focus requirement can hide the defect.
PROPOSAL: Require a delayed-RFB repeat tap with the pointer already at the intended coordinate and the caret initially elsewhere in the same field. Establish that the first tap places the caret before the prompt becomes usable, or return the limitation to the owner if the stock stack cannot establish that order.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary (lines 23, 27); Scope (line 116); Design / Detect and show the prompt (lines 126, 130, 132); Acceptance Criteria AC-10 and AC-12; Test Plan AC-10 and AC-12
EVIDENCE: The refreshed association expires on focus, eligibility, mode, window, phase or identity changes. A page can move or scroll a focused field without changing any of those values or the connected canvas geometry. One viewer can also scroll the remote page while a second viewer has a prompt open. A viewer that keeps renewing the original placement can satisfy the listed checks and still offer the prompt over a different region. AC-12 scrolls to a field but does not move that field with its prompt already visible.
PROPOSAL: Specify that a refresh repositions or dismisses a prompt whose remote field extent changes. Add a layout-only move or scroll while the same field keeps focus and the canvas retains its size.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary (lines 25, 27); Design / Detect and show the prompt (lines 130-132); Design / Type and dismiss (lines 138-140); Acceptance Criteria AC-10, AC-11 and AC-12; Test Plan AC-10 through AC-13; Tasks T7
EVIDENCE: The 500 ms lease starts from the latest valid sample. The Test Plan checks reordered replies, expired prompts, disconnects and current focus changes, but does not hold an otherwise valid response past the sample deadline or stall monitoring during composition while RFB stays connected. Starting the lease at response receipt or continuing to send newly committed input after the editor lease expired could pass these checks.
PROPOSAL: State how the viewer enforces the sample deadline across HTTP delay and checks it before opening the editor or sending newly committed input. Exercise delayed valid replies, interruption of monitoring during composition with RFB still connected, and a late reply after invalidation.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Scope (line 115); Design / Detect and show the prompt (lines 124, 126); Acceptance Criteria AC-10; Test Plan AC-10; Tasks T6
EVIDENCE: The scope covers contenteditable, but the feasibility gate and phone proof leave its markup unspecified. A fixture can add `role="textbox"` and multiline semantics, which Chromium serializes differently from an ordinary contenteditable editing host. The existing metadata probe at `tests/remote-gui/mobile-feasibility/editable-metadata.py:141-164` exercises neither form. A helper that only accepts an explicit text-box role could pass the proposed proof while leaving ordinary editing hosts unsupported. [Chromium accessibility state serialization](https://github.com/chromium/chromium/blob/156.0.8078.79/third_party/blink/renderer/modules/accessibility/ax_object.cc#L2202)
PROPOSAL: Require an ordinary `contenteditable` host without a fixture-added ARIA role in T6 and AC-10. Record the covered forms and return any required unsupported form to the owner through the existing feasibility gate.

FINDING: F-06
KIND: factual
SEVERITY: should-fix
WHERE: Design / Packaging and recovery (line 144); Acceptance Criteria AC-14; Test Plan AC-14; Tasks T8
EVIDENCE: The rollback procedure starts an old session before upgrade but only verifies the candidate session and the new sessions started after rollback. It never verifies that the original prior-package session remained usable across the upgrade. The existing `tests/remote-gui/legacy.e2e.test.ts:15-54` uses 0.3.0, while `tests/remote-gui/package.test.ts:11-16` identifies the current package at this target as 0.4.0. That older regression cannot establish the stated upgrade behavior for the immediately preceding package.
PROPOSAL: Check the original prior-package session still provides its browser and existing viewer behavior after the candidate starts. Include the original supervisor identity and session state in the assertions.

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: Context / Two-tap feasibility fixture (lines 33-35); Sources
EVIDENCE: The new fixture, source and XCTest observations have no evidence pointer in the exact target. `git ls-files '*two-tap*'` returned no fixture or artifact. A reader can distinguish the limited feasibility claim from the planned package proof, but cannot reproduce or inspect the stated run from its citations.
PROPOSAL: Link the disposable fixture source and a sanitized retained result or reproducible command for the desktop, hit-test and iPhone observations.

### R-8

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Context / Owner summary (line 23), Design / Detect and show the prompt (line 128), Acceptance Criteria AC-10, Test Plan AC-10, Tasks T6
EVIDENCE: The R-7 revision permits the prompt to appear while a same-field retap is in flight. It also permits withholding the prompt until a fresh framebuffer update makes the result eligible. AC-10 requires the test to activate the prompt and type before releasing the delayed pointer packet. That proof fails an implementation that safely waits for the click to place the caret. With a static page, the click can itself be the first operation that changes the framebuffer.
PROPOSAL: Let the delayed-click proof accept a prompt that becomes usable after the click places the caret. If the implementation offers it earlier, require the test to queue an edit before releasing the pointer packets and observe the caret placement before the edit.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary (lines 23 and 27), Context / Two-tap feasibility fixture (lines 33 and 35), Scope (line 116), Design / Detect and show the prompt (lines 124 and 128), Acceptance Criteria AC-10, Test Plan AC-10, Tasks T6
EVIDENCE: The R-7 revision adds consistent AT-SPI hits across a fresh framebuffer update. Chromium 156.0.8078.79 delegates the synchronous web hit to `CachingAsyncHitTest`. The renderer response and the framebuffer update have no freshness relationship established by this design. A redraw can occur while both calls return the same stale editable object with unchanged extent and focus. The AC-10 overlay check can run after the cache has caught up and miss that interval. The retained fixture's `focused.py:41-55` checks bounds and focus and does not reproduce the sequence. [Chromium hit-test delegate](https://github.com/chromium/chromium/blob/156.0.8078.79/ui/accessibility/platform/browser_accessibility.cc#L1135) [Chromium hit-testing design](https://chromium.googlesource.com/chromium/src/+/90f68b6bda019ed49895b274cbb151bb6b3cc541/docs/accessibility/browser/how_a11y_works_3.md#hit-testing)
PROPOSAL: Make T6 establish an allowed signal that distinguishes a current point hit from repeated stale hits. Require the prewarmed-overlay proof to confirm the newly covered pixels while the stale editable result is still observable and assert that no prompt appears in that interval. Return to the owner if stock Chromium cannot supply a signal that passes both the negative case and its uncovered positive control.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary (lines 23 and 27), Scope (line 116), Design / Detect and show the prompt (lines 124 and 128-132), Acceptance Criteria AC-10 and AC-12, Test Plan AC-10 and AC-12, Tasks T6-T7
EVIDENCE: The R-7 revision adds extent changes to the conditions that clear an open prompt. Its refresh can still check only the focused object and renew the lease when an overlay arrives after the prompt opens, leaving the object's identity, role, state and bounds unchanged. AC-10 covers an overlay already present at the first tap. AC-12 moves the field, which changes extent and does not reproduce occlusion at a fixed extent.
PROPOSAL: Specify how the viewer invalidates a visible prompt when its confirmed point ceases to be usable. Add a real case that covers the field after the prompt is visible without moving the field or changing focus, and require the viewer to reject activation when the refreshed hit is invalid or uncertain.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary (lines 23 and 27), Scope (lines 115-116), Design / Detect and show the prompt (lines 124 and 128-132), Acceptance Criteria AC-10 and AC-12, Test Plan AC-10 and AC-12, Tasks T6-T7
EVIDENCE: The design crosses viewer CSS coordinates, noVNC framebuffer pixels, X11 pointer coordinates and AT-SPI screen geometry without specifying their mapping. The installed noVNC `core/rfb.js:1162-1163` sends coordinates transformed by `Display.absX` and `Display.absY`. Chromium's Linux adapter gets the AT-SPI extents from unclipped screen DIPs. The fixture and phone proof can exercise a host with unit scale and miss an implementation that uses remote pixel coordinates as CSS or AT-SPI coordinates. [Chromium AT-SPI extent implementation](https://github.com/chromium/chromium/blob/156.0.8078.79/ui/accessibility/platform/ax_platform_node_auralinux.cc#L4103)
PROPOSAL: Define the coordinate conversions and the behavior when a required conversion cannot be established. Exercise a scaled canvas with a nonzero offset and prove that the actual click, accessibility hit and rendered prompt refer to the same field.

FINDING: F-05
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary (lines 23 and 25), Design / Detect and show the prompt (lines 130-132), Design / Type and dismiss (lines 138-140), Acceptance Criteria AC-10 through AC-12, Test Plan AC-10 through AC-12, Tasks T7
EVIDENCE: The R-7 revision checks that expired or late responses cannot restore a prompt or emit a commit. Its proofs never require successful renewal across a full original lease on an unchanged target. A viewer that opens only when the second tap is immediate, or dismisses a healthy editor after 500 milliseconds, can pass the listed negative assertions. The prior iPhone fixture has no lease and explicitly waits one second with the keyboard closed before tapping the prompt at `tests/remote-gui/mobile-feasibility/two-tap/TwoTapTests.swift:21-25`.
PROPOSAL: Hold a valid prompt beyond its initial lease with healthy refreshes, then open it. Hold the editor beyond its initial lease on the same focus and prove a later deliberate commit still arrives exactly once.

FINDING: F-06
KIND: factual
SEVERITY: should-fix
WHERE: Context / Evidence from the first design (line 41), Design / Type and dismiss (line 138), Acceptance Criteria AC-11, Test Plan AC-11, Tasks T7-T8
EVIDENCE: AC-11 promises one matching ordinary key pair per committed codepoint. Its proof uses `z`, `é` and `é`, all composed of BMP codepoints. A UTF-16 code-unit loop like the existing noVNC application bridge described in Context can pass every listed case while splitting a supplementary character into two invalid units.
PROPOSAL: Add a supplementary-plane character entered with the native keyboard or its emoji picker. Require one matching keysym press and release and the exact resulting synthetic text.

FINDING: F-07
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary (lines 25 and 29), Design / Detect and show the prompt (lines 124, 130 and 134), Design / Type and dismiss (line 140), Acceptance Criteria AC-11, AC-13 and AC-14, Test Plan AC-11, AC-13 and AC-14, Tasks T7-T8
EVIDENCE: The design discards in-flight metadata and pending text when the browser phase changes. AC-11 tests a focus change, a monitoring interruption and a disconnected RFB stream. AC-13 checks a stale generation and AC-14 runs the existing handoff regression. The existing Clipboard regression explicitly checks that RFB stays connected through handoff at `tests/remote-gui/browser.e2e.test.ts:374-377`. None of the listed tests holds an old-phase metadata reply or pending composition across that live handoff.
PROPOSAL: Add a live handoff while the viewer holds a pending composition and an in-flight metadata sample. Confirm the old editor and prompt are cleared, the delayed result cannot revive them, the replacement browser receives no stale text, and a deliberate new two-tap sequence works in the new phase.

FINDING: F-08
KIND: factual
SEVERITY: nit
WHERE: Context / Two-tap feasibility fixture (lines 33 and 35), Sources
EVIDENCE: The R-7 revision adds the two-tap fixture and the iPhone result location. Its tracked helper at `tests/remote-gui/mobile-feasibility/two-tap/focused.py:41-55` uses focus and bounds. The separate hit-test, overlay and omnibox observations still have no command or retained result identified in the document, and line 33 joins the Chromium and private-bus clauses without a conjunction.
PROPOSAL: Link or name the separate synthetic checks where their evidence is available and repair the opening sentence.

### R-9

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary (lines 23 and 27), Context / Two-tap feasibility fixture (line 35), Scope (line 116), Design / Detect and show the prompt (line 128), Acceptance Criteria AC-10, Test Plan AC-10, Open Questions
EVIDENCE: The post-R-8 revision permits a prompt over page content covering an eligible reported focus. The owner summary describes matching the tap to a field without explaining that exception. The fixture summary still lists stricter hit checks as pending, although the revised design expressly excludes a visual hit test from eligibility.
PROPOSAL: Add the covered-field behavior to the owner summary and describe the remaining packaged checks as reported-focus association, geometry and expiry.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary (line 23), Scope (lines 115-116), Design / Detect and show the prompt (lines 128-130), Acceptance Criteria AC-10, Test Plan AC-10 and AC-12, Tasks T6-T7
EVIDENCE: The post-R-8 coordinate rules transform the initiating viewer CSS point. Installed noVNC 1.5.0 `core/rfb.js:1226-1254` can substitute an earlier tap point before emitting a nearby repeat click. A correct CSS-to-framebuffer transform of the raw gesture point can still produce a different point from the click. AC-10 exercises adjacent rapid taps but the design leaves which point governs eligibility undefined.
PROPOSAL: Use the point emitted by noVNC for eligibility, or suppress the prompt when that point differs from the raw tap or cannot be established. Assert the emitted point in the adjacent-tap proof.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Scope (line 116), Design / Detect and show the prompt (line 128), Acceptance Criteria AC-10, Test Plan AC-10, Tasks T6, Open Questions
EVIDENCE: The R-8 overlay findings were superseded by the owner's decision to follow reported focus. AC-10 asks the test to verify that the prompt requires a deliberate second tap after a field is covered. The row gives no explicit pass condition for prompt visibility or successful activation in that case. A test that only verifies the keyboard stays closed after the first tap can pass when the viewer suppresses the prompt entirely.
PROPOSAL: With reported focus, mode and bounds held eligible, require the first tap to leave the keyboard closed and show the prompt. Require a deliberate tap on that prompt to open the keyboard.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary (lines 25 and 29), Design / Detect and show the prompt (lines 124, 130 and 134), Design / Type and dismiss (line 140), Acceptance Criteria AC-11, AC-13 and AC-14, Test Plan AC-11, AC-13 and AC-14, Tasks T7-T8
EVIDENCE: The post-R-8 AC-13 proof now holds a sample and composition during handoff, but it requires no old reply or text in the replacement browser. The viewing handset consumes the sample. A late sample could restore the old prompt or editor there while the replacement Chromium receives no text. The existing handoff regression confirms the RFB connection stays open at `tests/remote-gui/browser.e2e.test.ts:374-377`.
PROPOSAL: Release the held old-phase reply after handoff and assert that the viewer discards it, clears the old editor and pending composition, and sends no stale keys. Then prove a fresh two-tap edit through the same connected viewer.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Context / Two-tap feasibility fixture (lines 33 and 35), Sources
EVIDENCE: The post-R-8 revision corrects the opening sentence and adds the warm-cache and ordinary contenteditable observations. The linked fixture's `focused.py:41-55` still checks focus and bounds. The separate hit, overlay, omnibox and contenteditable observations have no named replay procedure or retained result in the document.
PROPOSAL: Name the disposable procedures or sanitized retained evidence for those observations where available.

### R-10

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary (line 23), Scope (lines 115-116), Design / Detect and show the prompt (lines 124 and 128-130), Acceptance Criteria AC-10, Test Plan AC-10 and AC-12, Tasks T6-T7
EVIDENCE: The post-R-9 design now uses the dispatched point. Installed noVNC 1.5.0 `core/rfb.js:1226-1254` can snap a nearby repeat tap back to the first point. AC-10 records the emitted coordinate but accepts either containment or a hidden prompt. A viewer that hides the prompt on every nearby repeat tap can pass that check even when the known dispatched point is inside an eligible reported focus.
PROPOSAL: Test a repeat tap whose raw and dispatched points fall on opposite sides of the reported bounds. Require a prompt when the known dispatched point is inside eligible bounds and suppression when it is outside.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary (line 23), Scope (lines 115-116), Design / Detect and show the prompt (lines 124 and 128-130), Acceptance Criteria AC-10, Test Plan AC-10, Tasks T6-T7
EVIDENCE: AC-10 promises a prompt on the first tap of a supported field. The design samples focus after RFB dispatch, but the metadata request can return before Chromium processes the click. If the sample still reports a different field outside the dispatched point, the prompt stays hidden and the specified refresh never starts. The delayed different-field test names the action but gives no expected outcome after the click reaches Chromium.
PROPOSAL: Specify whether an otherwise valid tap must recover from a sample that precedes the click. Give the delayed different-field case explicit assertions before and after click delivery, including whether the user needs another field tap.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary (lines 25 and 29), Design / Detect and show the prompt (lines 124, 130 and 134), Design / Type and dismiss (line 140), Acceptance Criteria AC-11, AC-13 and AC-14, Test Plan AC-11 through AC-14, Tasks T7-T8
EVIDENCE: The post-R-9 AC-13 proof now observes the viewer, but it releases the old reply after a live handoff without checking whether its lease is still valid. The existing handoff waits for the old Chromium process to exit and launches the replacement in `plugins/remote-gui/internal/browser/phase.go:184-227`. If the handoff consumes the 500 millisecond lease, expiry alone clears the editor and rejects the reply. The test can pass with phase validation missing.
PROPOSAL: Keep the real handoff scenario and add a deterministic phase-change check that delivers an otherwise valid old-phase success before lease expiry. Assert that the viewer clears the old editor and composition on phase invalidation, discards the reply and sends no keys from a late composition event.

FINDING: F-04
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary (line 27), Scope (lines 115-116), Design / Detect and show the prompt (lines 124 and 128-130), Acceptance Criteria AC-10 and AC-12, Test Plan AC-10 and AC-12, Tasks T6-T7
EVIDENCE: The design requires conversion between dispatched framebuffer pixels and AT-SPI screen geometry, with suppression for unknown mappings. AC-12 exercises a scaled, offset viewer canvas. That exercises the viewer conversion but can run with unit host scale throughout, allowing a helper that assumes framebuffer pixels always equal AT-SPI coordinates to pass.
PROPOSAL: Exercise a known non-unit host conversion or prove suppression when that conversion cannot be verified. Keep the scaled and offset canvas case for the viewer conversion.

FINDING: F-05
KIND: factual
SEVERITY: nit
WHERE: Context / Two-tap feasibility fixture (lines 33-35), Design / Detect and show the prompt (lines 128-130), linked `tests/remote-gui/mobile-feasibility/two-tap/README.md` (line 17)
EVIDENCE: The revision names the disposable hit and signature probes and records the owner's reported-focus decision. The linked fixture still says the product requires additional hit checks, which conflicts with that decision.
PROPOSAL: Update the fixture description to name the remaining reported-focus association, geometry and freshness checks.

### R-11

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary (line 23), Scope (lines 115-116), Design / Detect and show the prompt (lines 128-130), Acceptance Criteria AC-10, Test Plan AC-10 and AC-12, Tasks T6-T7
EVIDENCE: The R-10 revision gives AC-10 explicit outcomes for emitted points inside and outside reported bounds. The fixture still need not demonstrate that noVNC snapped a repeat tap across those bounds. Installed noVNC 1.5.0 `core/rfb.js:1226-1254` only substitutes the previous point under its timing, gesture-type and distance conditions. Both test cases can produce matching raw and emitted eligibility, allowing a viewer that uses raw coordinates to pass.
PROPOSAL: Require the fixture to measure and assert a snap with the raw and emitted points on opposite sides of the same eligible bounds. Cover both directions and derive the expected prompt outcome from the emitted point.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary (lines 25 and 29), Design / Detect and show the prompt (lines 124, 130 and 134), Design / Type and dismiss (line 140), Acceptance Criteria AC-11, AC-13 and AC-14, Test Plan AC-11 through AC-14, Tasks T7-T8
EVIDENCE: The R-10 revision checks server-side rejection when the generation changes before a helper result is released. That leaves the viewer untested against a successful old-generation reply that the server produced before the transition and that arrives after the viewer sees the change. The real handoff case releases a held reply without requiring it to remain within the 500 millisecond lease. The server check and lease expiry can make both cases pass even if the viewer accepts a still-fresh old-generation success.
PROPOSAL: Retain the server rejection case. Add a deterministic viewer case that delivers a successful old-generation reply within its lease after the viewer observes the new generation, then delivers a late composition commit and asserts no prompt or editor restoration and no key traffic.

### R-12

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary (line 23), Scope (lines 115-116), Design / Detect and show the prompt (lines 128-130), Acceptance Criteria AC-10, Test Plan AC-10 and AC-12, Tasks T6-T7
EVIDENCE: The R-11 revision requires measured snaps across the field boundary in both directions. When the raw repeat tap is outside and the dispatched point is inside, the preceding tap was already inside at the same dispatched point under noVNC 1.5.0 `core/rfb.js:1226-1254`. The test can count the preceding tap's prompt as success even if the viewer ignores the repeat tap. In the reverse case the preceding tap can leave the prompt hidden, so ignoring the repeat tap can pass both cases.
PROPOSAL: Keep the measured two-direction snaps and prove that the repeat tap determines the result. Hold the preceding tap's metadata while preserving noVNC's tap history, then require the repeat tap's eligible response to produce the prompt in the inside-dispatch case.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary (lines 25 and 29), Design / Detect and show the prompt (lines 124, 130 and 134), Design / Type and dismiss (line 140), Acceptance Criteria AC-10, AC-11, AC-13 and AC-14, Test Plan AC-11 through AC-14, Tasks T7-T8
EVIDENCE: The R-11 revision adds a still-fresh old-phase success, but the separate viewer case does not require an active editor and pending composition before the phase change or require the production viewer to observe the phase through its actual connected path. Design allows one focus request at a time and leaves phase observation while a reply is held unspecified. The existing live handoff at `tests/remote-gui/browser.e2e.test.ts:374-380` keeps RFB connected and learns the new mode only after a separate Clipboard refresh. A deterministic test can inject a changed token into empty viewer state while the live test passes through lease expiry alone.
PROPOSAL: Specify how the connected viewer observes a phase change while a focus response is pending. Drive that path in the deterministic check with a live editor and pending composition, assert that the observed change clears both before the lease expires, then deliver the still-fresh reply and late commit.

### R-13

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design / Detect and show the prompt (lines 130 and 134), Design / Type and dismiss (line 140), Test Plan AC-13 and AC-14, Tasks T6-T8
EVIDENCE: The R-12 revision requires the phase read to stay responsive during handoff. The existing viewer proxy calls `upstreamAlive` before dispatching browser routes (`plugins/remote-gui/internal/proxy/proxy.go:314-325`). That callback invokes `browserState.alive()` (`plugins/remote-gui/internal/session/daemon.go:559-569`), which takes a read lock on the same mutex the handoff holds through replacement browser startup (`plugins/remote-gui/internal/session/handoff.go:35-39,63-65,91-99`). AC-13 can pass with a substituted phase reply in the deterministic check and lease expiry in the real handoff check, even if the actual authenticated phase route waits until handoff completes.
PROPOSAL: Hold a real handoff open after the phase advances and while the old focus sample is pending. Require the actual authenticated phase route to return the advanced number before either hold is released, and apply the route's method, origin, identity and expiry checks to that endpoint.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design / Detect and show the prompt (lines 128 and 130), Design / Type and dismiss (line 140), Test Plan AC-13
EVIDENCE: AC-13 at `37ca8edd` required the old-phase success to reach the viewer within its lease. The R-12 revision requires the editor to clear before the lease expires and then delivers the held reply, with no deadline for that delivery. Lease expiry can still account for rejection of the reply and the absence of queued keys.
PROPOSAL: Deliver the held success and late composition commit before the original lease deadline. Record the deadline and delivery times without renewing the old lease.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design / Detect and show the prompt (lines 128, 130 and 134), Test Plan AC-10, AC-12 and AC-13
EVIDENCE: The R-12 revision adds an independent phase request while a focus request is pending. Line 134 still says any newer request from a viewer supersedes its older request. Applied across both request types, an unchanged phase poll could invalidate a valid focus sample and prevent normal prompt display or lease renewal.
PROPOSAL: Scope supersession to focus requests within one viewer and track phase reads independently. Hold a valid focus response while an unchanged phase reply arrives, then verify the focus response still displays the prompt or renews its lease.

### R-14

NO FINDINGS

## Sources

- [Post-merge agent entry](https://github.com/vhco-pro/docs/blob/0c983f6793bfe35eb96ae95ad0c361c6200af44f/AGENTS.md) and [feature-document standard](https://github.com/vhco-pro/docs/blob/0c983f6793bfe35eb96ae95ad0c361c6200af44f/conventions/feature-documents.md): current review rules, retained acceptance after covered-source drift and corrections outside the normative baseline.

- [Pinned agent entry](https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/AGENTS.md) and [task routes](https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/README.md): required knowledge and authoring routes.
- [Pinned feature-document standard](https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/conventions/feature-documents.md), [template](https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/guides/feature-document-template.md), [documentation](https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/conventions/documentation.md), [delivery](https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/conventions/delivery.md), [frontend verification](https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/conventions/frontend-testing.md) and [humanize prose](https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/guides/humanize-prose.md): authoring, evidence and publication rules used for this draft.
- [noVNC overview](https://novnc.com/info.html) and [RFB API](https://novnc.com/noVNC/docs/API.html): mobile remote desktop and canvas input are existing capabilities; the core library differs from its complete application and exposes no editable-DOM map.
- [WebKit bug 195884](https://bugs.webkit.org/show_bug.cgi?id=195884), comments 4 and 6: historical user-gesture focus policy and the distinct native embedding-client case; not current device verification.
- [Chromium accessibility overview](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/accessibility/overview.md) and [inspection tools](https://chromium.googlesource.com/chromium/src/+/HEAD/tools/accessibility/inspect/README.md): native accessibility architecture, cache lag and Linux inspection support; not proof for this installed sandboxed browser.
- [AT-SPI state definitions](https://gnome.pages.gitlab.gnome.org/at-spi2-core/libatspi/enum.StateType.html) and [component bounds](https://gnome.pages.gitlab.gnome.org/at-spi2-core/libatspi/method.Component.get_extents.html): editable/visible state and screen/window geometry APIs.
- [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts): extension instrumentation introduces frame/permission requirements; no extension path is authorized by this proposal.
- [Guacamole user interface](https://guacamole.apache.org/doc/gug/using-guacamole.html) and [Kasm control panel](https://www.kasmweb.com/docs/develop/user_guide/control_panel.html): existing text-input and supplemental-key patterns, including explicit keyboard controls; these do not establish this feature's selective first-tap behavior.

- [noVNC 1.5.0 license](https://github.com/novnc/noVNC/blob/v1.5.0/LICENSE.txt): MPL-2.0 scope and notices for core/application JavaScript.
- [noVNC release history](https://github.com/novnc/noVNC/releases) and [1.7.0 application input bridge](https://github.com/novnc/noVNC/blob/v1.7.0/app/ui.js): upstream version context and continued local-input/focus pattern; not local installation or native-device proof.

- Installed x11vnc manual, read with `gzip -dc /home/m/.local/share/remote-gui/host-tools/usr/share/man/man1/x11vnc.1.gz`, decompressed lines 918-929,3713-3717,5925-5929: input categories, disabled VNC selection exchange and native per-client input permissions. The documented controls are candidates, not verified client attribution or transfer guarantees.

### R-15

FINDING: F-01
KIND: factual
SEVERITY: nit
WHERE: Context / Packaged implementation checks (line 57)
EVIDENCE: The post-R-14 evidence describes a single HTTP 503 from the phase route. `git show d607a7b1 -- tests/remote-gui/mobile.e2e.test.js` adds a phase-route 503 immediately after an existing focus-route 503 before the same field tap. Both one-shot failures remain at `tests/remote-gui/mobile.e2e.test.js:161-163` in the reviewed commit.
PROPOSAL: Say that the tracked browser test injects one 503 on each route before the same tap. If a separate phase-only reproduction was run, identify that procedure separately.

### R-16

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary (line 29), Scope (lines 137–138), Design / Packaging and recovery, Test Plan AC-14, Tasks T8
EVIDENCE: The revised scope limits initial support to iPhone Safari. `plugins/remote-gui/README.md:5–7` still promises the phone keyboard without naming a supported browser. `plugins/remote-gui/internal/proxy/viewer.go:235` enables the feature for any touch-capable viewer, so the current AC-14 comparison with installed behavior could pass with the unqualified promise intact.
PROPOSAL: Require the shipped instructions to name iPhone Safari as the supported platform and Android Chrome as deferred. Make that wording an explicit AC-14 check.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary (line 27), Context / Packaged implementation checks (lines 51 and 57), Scope (line 139), Design / Detect and show the prompt (line 153), Design / Type and dismiss (line 163), Acceptance Criteria AC-10 through AC-12, Test Plan AC-10 through AC-12
EVIDENCE: Context describes a disabled prompt that can recover within its original lease and an open editor that pauses input for up to three seconds during verification loss. `plugins/remote-gui/internal/proxy/mobile.js:85–124,198–213` implements these states. Scope says unavailable metadata leaves the prompt hidden. The test plan checks expired replies and healthy renewals, so an implementation that immediately closes the editor on a temporary failure can pass.
PROPOSAL: Define the temporary verification-loss behavior and its deadlines in Design. Require checks for activation refusal, recovery and expiry of an unopened prompt, plus editor recovery on the same field and phase with no key traffic or replay from the pause.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Design / Detect and show the prompt (lines 151–153), Acceptance Criteria AC-10 and AC-12, Test Plan AC-10 and AC-12
EVIDENCE: Design requires prompt invalidation when the canvas geometry changes. AC-12 checks alignment on a scaled and offset canvas but never requires that geometry to change after a tap while the framebuffer dimensions stay the same. `plugins/remote-gui/internal/proxy/mobile.js:77–81,348–350` compares only framebuffer dimensions and otherwise repositions an existing prompt.
PROPOSAL: Exercise a change in the canvas scale or offset with fixed framebuffer dimensions after a tap. Require the pending response or visible prompt to be discarded, then verify that a fresh tap maps correctly.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Context / Packaged implementation checks (line 47)
EVIDENCE: The paragraph ends by saying the repaired build still needs Android verification. The release scope and owner summary now defer that verification and report a newer physical Safari pass.
PROPOSAL: Put the remaining verification statement in the past tense so it describes that earlier build.

### R-20

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Design / Detect and show the prompt (line 153), Acceptance Criteria AC-10, Test Plan AC-10
EVIDENCE: The R-16 revision requires the same prompt to recover within its original lease. AC-10 checks that tapping cannot open the keyboard until verification recovers, but never explicitly requires a successful tap on that same prompt after recovery. An implementation that permanently disables the prompt after one phase failure can pass the refusal and expiry checks.
PROPOSAL: Restore both checks before the original deadline and require a tap on the same prompt to open the keyboard without another remote field tap.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design / Detect and show the prompt (line 153), Acceptance Criteria AC-12, Test Plan AC-12
EVIDENCE: The R-16 revision requires both scale and position changes to invalidate pending and visible prompts. AC-12 lets the test choose one geometry change. It also does not require an otherwise valid pending response to be delivered before expiry, so expiry alone can account for its rejection.
PROPOSAL: Change scale and position independently with fixed framebuffer dimensions. For each pending case, release an otherwise valid response inside its original lease and verify it cannot display a prompt. For each visible case, verify the geometry change clears the prompt before expiry.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary (lines 25 and 27), Design / Detect and show the prompt (line 153), Design / Type and dismiss (line 163), Acceptance Criteria AC-11 and AC-12, Test Plan AC-11 and AC-12
EVIDENCE: The R-16 revision removes the previous qualification that a changed field extent invalidates an unopened prompt. The revised general invalidation rule can also apply to an open editor, although Design calls for typing to stay active during keyboard-induced viewport changes while focus and mode remain current. The implementation at `plugins/remote-gui/internal/proxy/mobile.js:190-198` applies the extent check only before opening.
PROPOSAL: State whether an extent change alone invalidates an open editor when field, mode and phase remain the same. If the existing behavior is intended, retain the unopened-prompt qualification and check that keyboard animation can move or resize the field without dismissing the editor.

### R-21

NO FINDINGS

### R-19

FINDING: F-01
KIND: factual
SEVERITY: nit
WHERE: Context / Packaged implementation checks (line 41 and line 49); Tasks T8 partial evidence (line 195)
EVIDENCE: I rated this pass under docs e79eaa6a0126f2e8ddca2cf14e3db3067b244cc7, the revision AGENTS.md pins at ee6ac65605a4c8ca44ef5b8610472f7eb6c05c87 and the one `vh-adlc lint` reports with source "repository". The dispatch named 0c983f6 instead, and its short SHA ee6ac6567 does not resolve to HEAD. The convention makes this a full pass because AGENTS.md, a bridge file, changed. On the finding itself: line 41 says "The mobile helper now rechecks the last verified field without rescanning the tree", and line 49 says "Raising the limit to 384 kept the same lookup deadline." Commit 86ae7838, made after R-15, took out both. `git show 86ae7838` deletes the `hint`/`hintEpoch` fields from mobile.go and the hint path, MAX_NODES = 384 and the tree walk from mobile_focus.py. The helper is now a persistent worker that calls `Collection.GetMatches` with a limit of 2. Line 195 describes the new approach, so lines 41 and 49 now contradict it about how the helper works today.
PROPOSAL: Put lines 41 and 49 in the past tense, or add one line saying the focused-state match query in T8 replaced the hint recheck and the node limit.

FINDING: F-02
KIND: factual
SEVERITY: nit
WHERE: Context / Owner summary (fourth paragraph, line 29); Context / Packaged implementation checks (lines 45 and 55); Tasks T8 partial evidence (line 196)
EVIDENCE: For observed proof, the Owner summary names only "The earlier physical fixtures ... Their cooperative pages did not prove this implementation." The detailed sections record three things it leaves out. Line 45 has packaged iPhone Safari passes against `492c2f9e`. Line 55 has the owner's 2026-11-20 approval to ship after using the preview. Line 196 has a physical Safari pass on the repaired package f01a8253... with exactly one `z` edit. The standard asks for the summary to be refreshed when proof changes and to separate planned checks from observed proof.
PROPOSAL: Give the summary one or two sentences on validation state: packaged iPhone Safari passed the ordinary text case, the owner approved shipping, and Android plus the rest of the physical matrix are still open.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Context (opening paragraph, line 17, and Owner summary); Context / Existing mobile viewers (lines 113-115); Scope (line 139)
EVIDENCE: Line 17 states the goal ("Make the shared browser usable from a phone"). Context never says who is harmed without the feature, how often, how badly, or whether it heals on its own. Scope line 139 excludes "an extra toolbar keyboard button", the simplest alternative with no new machinery. Lines 113-115 show noVNC 1.7.0, Kasm and n.eko already ship that button. No line gives the reason it was rejected. The design adds a private AT-SPI bus, a worker process, a separate phase route and leases, which is a lot for a single-user alpha. The document is past draft, so this is a nit.
PROPOSAL: Add a short harm statement to Context and one line saying why the owner rejected the stock noVNC keyboard button, so the proportionality of the helper and phase machinery can be checked against it.

### R-22

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary; Scope; Design / Packaging and recovery; Acceptance Criteria AC-14; Test Plan AC-10, AC-11, AC-12 and AC-14; Tasks T8; `tests/remote-gui/mobile-physical/README.md:13`
EVIDENCE: The reconciled plan limits physical release verification to iPhone Safari and defers Android Chrome. The physical procedure added by `9989ed70` instructs the tester to run the T8 checklist on both phones. The installed README and skill already describe Android as deferred.
PROPOSAL: Make iPhone Safari the required T8 run in the fixture checklist and mark any Android run as follow-up evidence.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design / Detect and show the prompt; Acceptance Criteria AC-12; Test Plan AC-12; Tasks T7 and T8
EVIDENCE: AC-12 requires an unopened prompt and pending sample to invalidate on independent canvas scale and position changes. `plugins/remote-gui/internal/proxy/mobile.js:77-81` only compares framebuffer dimensions. Design also keeps an open editor active when the verified field moves during keyboard animation, but `mobile.js:168-179,214` resamples the original tap coordinates and `plugins/remote-gui/internal/browser/mobile_focus.py:71-79` refuses a field that moves fully off that point. The proof allows a move small enough to keep the initiating point inside the field. T7 is checked and T8, the only unchecked task, names physical verification and rollback.
PROPOSAL: Add unchecked regression and implementation tasks for these AC-12 behaviors before the final package run. Require the open-editor case to move the same eligible field fully away from the original tap and demonstrate that the next edit still reaches it.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Acceptance Criteria AC-10 and AC-11; Test Plan AC-10 and AC-11; Tasks T8; `tests/remote-gui/mobile-physical/README.md:15-21` and `tests/remote-gui/mobile-physical/fixture.py:44-51`
EVIDENCE: The reconciled physical checklist makes the two-codepoint accent conditional even though AC-11 requires it. The fixture logs remote DOM input and focus events. It does not record pointer counts, caret position or RFB press/release pairs. A tester following the checklist can observe a visible keyboard and final text while missing an extra remote click, an incorrectly placed caret or duplicate traffic that produces no DOM edit.
PROPOSAL: Name the check that captures each required pointer, caret and RFB assertion, and identify which checks use native iPhone input and which use a separate deterministic harness. Give the decomposed-accent case a reproducible input method and verify the delivered codepoints explicitly.

FINDING: F-04
KIND: factual
SEVERITY: nit
WHERE: Context / Owner summary; Test Plan AC-14; Tasks T8 partial evidence
EVIDENCE: The owner summary describes packaging checks as still needing evidence. Reconciliation added a documented rollback, desktop input and cleanup run built from `9bf555a3` in T8. AC-14 still requires the complete check on the final package candidate, and the recorded rollback used desktop touch emulation.
PROPOSAL: Include the earlier package rollback and cleanup evidence in the owner summary, with its build and desktop limitation. Keep exact-candidate verification, the remaining native iPhone cases and independent implementation review open.

### R-23

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Context / Owner summary; Design / Detect and show the prompt; Design / Type and dismiss; Acceptance Criteria AC-11 and AC-12; Test Plan AC-11 and AC-12; Tasks T9
EVIDENCE: The revision says the existing pause and dismissal rules apply if a still-focused field moves off the verified tap point. The helper returns a successful no-match for that move (`plugins/remote-gui/internal/browser/mobile_focus.py:71-79`). The viewer clears the editor on a no-match (`plugins/remote-gui/internal/proxy/mobile.js:183-192`). The revised design still describes a temporary verification failure as recoverable, and the new test covers only the move that keeps the field over the original point. A tester cannot tell whether immediate dismissal or a recoverable pause is the expected result after a no-match.
PROPOSAL: State that a successful no-match at the original point dismisses the editor and clears unsent composition, while temporary request failure can recover under the existing timeout. Add an open-editor test that moves the same field fully off that point and verifies dismissal and no further keys until a new deliberate two-tap sequence.

### R-24

NO FINDINGS
