---
status: draft
status_description: "The keyboard metadata boundary is revised and awaiting independent review."
branch: feat/remote-gui-mobile
issue: null
goal: "Use a remote-gui browser from a phone with selective first-tap native keyboard input, normal text editing and touch scrolling."
covers:
  - plugins/remote-gui/
  - tests/remote-gui/
  - .github/workflows/ci.yml
  - .agents/plugins/marketplace.json
  - .claude-plugin/marketplace.json
---

# Plan: Native mobile browser interaction

Make the shared browser usable from a phone. Tapping a remote editable field opens the phone's own keyboard immediately, with text editing and scrolling that remain usable while the keyboard changes the viewport.

## Context

### Owner summary

The owner accepted a first delivery covering native keyboard input, text editing and touch interaction on current iOS Safari and Android Chrome. The first tap on a remote textbox must open the actual phone keyboard. A separate keyboard button, a second activation tap and opening the keyboard on every page tap do not meet that requirement. Additional controls provide only required keys absent from the phone keyboard. Autofill, passkeys, camera integration and native phone pickers remain separate work.

One focused viewer will control all remote pointer, hardware-keyboard and mobile-editing input. Other connected viewers watch until they acquire control. This changes the current simultaneous-input behavior and prevents another viewer's click from moving focus beneath an acknowledged phone edit. Scrolling uses a normal one-finger swipe; deliberate hold-and-drag remains available for remote selection or dragging.

The implementation must reuse noVNC's existing gesture recognition, key transport, focus controls and text-input machinery wherever those meet the accepted behavior. An evaluation against the installed version comes before any custom accessibility adapter. Custom work is limited to demonstrated gaps: selective editable metadata, field binding, input ownership enforcement and the small mappings needed for the accepted phone interactions. No new streaming, clipboard or parallel gesture stack is planned.

The candidate metadata source is a private, session-owned Linux accessibility adapter. It may publish safe editable geometry and input flags, never field contents, labels or URLs. Human mode keeps automation, CDP and extensions disabled. Installed libraries and upstream APIs establish possible routes; this work has proved neither sandboxed Chromium integration nor native phone-keyboard behavior. A later implementation must first pass the owned synthetic feasibility gate on actual iOS Safari and Android Chrome. Exact phone models, OS/browser versions and keyboard settings belong in that implementation evidence. The owner approved allowing the private Chromium adapter to receive the attribute map for an eligible control, keep the recognized input type and discard the rest. This is a host implementation detail. The phone viewer still runs in Safari and Chrome.

Independent R-2 returned no findings on the revised baseline; its model identity was not attested and isolation was procedural. The owner accepted the brief in session on 2026-11-19 and requested upstream reuse. R-1 remains preserved as history. That acceptance settles scope and is recorded against R-2 without another preference question. It does not authorize mobile code or probes in this spec-only operation. The deterministic planning gate passed; no implementation proof is implied. A later implementation request, release, installation and any changed privacy/dependency boundary remain separate actions.

### First feasibility run

The implementation claim passed the vh-adlc in-progress gate. T1 remains open.

The installed noVNC 1.5.0 provides focus, key transport, gesture recognition and a local text bridge. The application bridge opens its editor from a keyboard button. It has no remote editable region metadata. Its text loop works in UTF-16 code units, so the source alone does not establish composition or Unicode correctness.

`bash tests/remote-gui/mobile-feasibility/run-editable-metadata.sh <new-artifact-directory>` runs the synthetic Chromium probe. It uses a private bus, isolated profile and Xvfb display. The launcher and registry had to be started explicitly after D-Bus service activation was denied on this host. The probe checks the publisher PID and reads roles, state and bounds. Chromium 156.0.8078.79 with renderer accessibility enabled reported the same role and state for text, email, URL, search and telephone inputs. Numeric, password and multiline controls had distinct signatures. With `REMOTE_GUI_PROBE_GEOMETRY_ONLY=1`, the probe exited 1 because roles and states could not select the required keyboard modes.

The [Chromium attribute implementation](https://github.com/chromium/chromium/blob/156.0.8078.79/ui/accessibility/platform/ax_platform_node_base.cc#L1064) includes `text-input-type` in the same map as page placeholders and HTML input names. The [AT-SPI Accessible interface](https://github.com/GNOME/at-spi2-core/blob/2.58.9/xml/Accessible.xml#L989) exposes that map through `GetAttributes`. It has no method to select one object attribute. The first probe did not call it. A second synthetic run with the approved read resolved text, email, URL, search, telephone, numeric and password types. The multiline state identified the textarea. The email control included synthetic description and input-name markers. They were present in the D-Bus reply and absent from the emitted modes and retained diagnostic logs. This proves host-side classification for those controls. It does not exercise phone focus, control transfer or remote editing.

With two authenticated RFB clients on the disposable Xvfb display, x11vnc 0.9.17's `-afteraccept` hook reported distinct native client IDs and source ports. A synchronous `client_input` change blocked pointer motion from the disabled client while the enabled client could still move the pointer. With the old viewer holding Button 1, the disable acknowledgement left that button down and the next viewer's pointer move was blocked. The command alone does not fence a transfer. The deployed WebSocket attribution, queued input drain and target-bound editing remain to be proved.

The same synthetic HTTPS viewer can exercise both phone browsers. On iPhone, an Xcode UI test can send a screen tap in Safari and assert the system keyboard appears. On Android, ADB can drive Chrome taps and record Android's input method visibility along with an OS screenshot. Both runs also need to assert which synthetic remote field received the caret and that taps outside editable regions leave the keyboard closed. An iOS Simulator or Android emulator can help develop these runs. Neither replaces the accepted physical phone proof. The Mac is reachable over SSH, but Xcode reported administrator authorization was required for its components and listed no paired device. No physical Android device was available to the run.

### Resizing prerequisite after merge

[PR 121](https://github.com/michielvha/vh-adlc/pull/121) merged at [0708e3cb](https://github.com/michielvha/vh-adlc/commit/0708e3cb33dd1fe1e85f4e8da74b598ee32f96a0) on 2026-11-19. Both remote-gui manifests at that commit report 0.4.0, and both marketplace catalogs resolve to its local package. This establishes the prerequisite in the default-branch source; it does not establish an installed plugin update or any mobile capability.

Independent R-3 rechecked this unchanged mobile baseline against the merged source with no findings. Model identity was not attested and isolation was procedural. The existing R-2 owner acceptance remains valid because Scope, Design, Acceptance Criteria, Test Plan and covers are unchanged. No mobile task breakdown, implementation or feasibility probe was started.

### Background

At default-branch commit [cdf8956](https://github.com/michielvha/vh-adlc/commit/cdf89564a5d079340922584c83f183ca4ffa8cc2), the viewer imports noVNC's RFB core and connects a canvas. Its local textarea belongs to the Clipboard panel; resize restores canvas focus except while that panel owns focus (`plugins/remote-gui/internal/proxy/viewer.go:30,39-45,118-128`). Human Chromium disables extensions; only agent mode adds automation and loopback debugging (`plugins/remote-gui/internal/browser/phase.go:20-58`). Owner identity and expiry checks precede viewer access (`plugins/remote-gui/internal/proxy/proxy.go:289-315`, `identity.go:17-67`). Existing X11 helpers handle clipboard, menus and native windows, not page-editable semantics (`plugins/remote-gui/internal/xclip/xclip.go:1-5`, `menus.go:1-16`).

Adaptive sizing is prerequisite work in [PR 121](https://github.com/michielvha/vh-adlc/pull/121), observed open at [d9849b1](https://github.com/michielvha/vh-adlc/commit/d9849b1be481b5bfea02f7b7e566f33ac3668cf2) before this revision. Its reviewed implementation at [e2ac2d7](https://github.com/michielvha/vh-adlc/commit/e2ac2d757750d3495a1167dfd5ea29674ad68ca1) and committed state at [417c4c4](https://github.com/michielvha/vh-adlc/commit/417c4c4e61bef22946b5e26e205c68e9ad1e77df) resize the visual viewport and owned X11 browser (`plugins/remote-gui/internal/proxy/viewer.go:122-207` at 417c4c4). Those commits do not establish native phone keyboard behavior. A PR is not proof of merge, release or installation. At mobile implementation intake, verify the backend exists in the selected implementation base; otherwise wait for its separately authorized merge.

Read-only inspection found noVNC 1.5.0 installed on this host. RFB already provides keyboard capture, key transport, focus and gestures; its separate application has a local text-input bridge (`core/rfb.js:261-266,304-317,461-489,1257-1374`; `app/ui.js:250-264,1439-1595`). Current upstream 1.7.0 retains the application bridge pattern. These are existing upstream capabilities, not new remote-gui inventions. Neither the documented RFB API nor that bridge supplies a remote editable-field map or selective first-tap phone-keyboard activation.

Read-only host checks found Python `gi`, `pyatspi` and `dbus`, AT-SPI libraries, `dbus-run-session` and the AT-SPI bus launcher/registry. No accessibility bus/tree or GUI session was opened for this research. Other hosts may lack these dependencies.

## Scope

The first delivery includes keyboard editing and touch interaction on actual current iOS Safari and Android Chrome. Exact devices and software versions must be recorded when those implementations are validated; no particular device is already verified.

- Support ordinary editable text, password, email, URL, search, telephone and numeric fields, textareas, contenteditable regions, browser address/search fields and editable fields in cross-origin frames.
- Preserve insertion, composition, correction, deletion, remote caret placement and selection replacement. Safe metadata selects the corresponding text, email, URL, search, telephone or numeric phone-keyboard mode.
- Support one-finger swipe scrolling, deliberate hold-and-drag selection/dragging and existing adaptive sizing, with the active field and form actions reachable while the keyboard is open.
- Provide supplemental controls only for required keys unavailable on the active phone keyboard, such as modifiers, Escape, Tab or arrows. No general keyboard activation button is added.
- One focused viewer controls all pointer, hardware-keyboard, mobile-editing and viewer-initiated clipboard mutations; other viewers watch. Desktop input remains available to the controller. Preserve the Clipboard panel, browser handoff and private session cleanup.
- Reuse the installed noVNC APIs/helpers and existing clipboard path before adding code for a demonstrated gap. A version upgrade or dependency addition needs its own justified compatibility and delivery checks.

Out of scope: phone password-manager/autofill integration, passkey forwarding, camera/microphone integration, native phone select/file pickers, download redesign, custom drawn editors without useful editable semantics, changes to service-share applications, a native phone app and replacement of noVNC/VNC streaming. This feature makes no universal claim about arbitrary inaccessible web applications.

| Term | Meaning |
| --- | --- |
| Native phone keyboard | The phone operating system's software keyboard, opened by the viewer's local editing element. |
| Supplemental keys | Controls that send required remote keys absent from the active phone keyboard. |
| Controlling viewer | The focused viewer whose current server-issued authority permits remote input; other connected viewers can watch. |

## Design

### Reuse existing noVNC capabilities first

Before designing a custom metadata adapter, evaluate the actual installed noVNC package and version with owned synthetic fixtures. Keep framebuffer streaming and VNC event encoding in noVNC and the existing server. The installed 1.5.0 source and current public API support the following division:

| Capability | Reuse and compatibility boundary | Gap to prove |
| --- | --- | --- |
| Hardware keys and supplemental keys | RFB `sendKey()`, existing Keyboard/keysym helpers and the existing VNC transport. | Prevent duplicate emission when local text-input events also occur; keep ordered field-bound delivery. |
| Local phone typing | The application's local-input/`input` adaptation and Keyboard integration are established patterns (`app/ui.js:250-264,1520-1595`). | Do not import the complete application or assume its UTF-16 character loop proves IME, grapheme or selection correctness. Adapt the smallest necessary version-matched part and test it. |
| Focus and viewer state | Public `focus()`, `blur()`, `focusOnClick` and `viewOnly`. | Canvas focus does not open an OS keyboard. `viewOnly` is a client UI guard, not authoritative multi-viewer input enforcement. |
| Touch and scrolling | Existing noVNC GestureHandler and coordinate/VNC pointer transport. | In 1.5.0, one-finger drag is mouse drag and two-finger drag sends wheel events (`core/rfb.js:1257-1374`). Use a small mapping adapter for accepted one-finger scrolling and intentional hold-and-drag; do not create a parallel recognizer. |
| Clipboard | The existing owner-initiated Clipboard panel and native X11 helper. | Preserve its privacy rules and controller authorization; do not synchronize clipboards automatically or use clipboard paste as routine typing. |
| Per-viewer input permission | First evaluate the installed x11vnc `-input` and remote `client_input` controls; retain the existing `-nosel` boundary and manual Clipboard panel. | The manual documents per-client K/M/B permissions, not a proven owned-WebSocket/client-ID mapping or transfer barrier. Clipboard mutation still needs separate supervisor authorization. |
| Editable discovery and safe target identity | Native platform accessibility is a candidate source. | RFB exposes framebuffer/input APIs, not editable DOM bounds, input types or an atomic field-binding protocol. This remains custom, feasibility-gated integration. |

Record the tested noVNC version, source identity, APIs/helpers reused and any small adaptation with its failing behavior case. Preserve noVNC license notices and applicable MPL-2.0 source obligations for JavaScript reused or modified; `LICENSE.txt` identifies `core/**/*.js` and `app/*.js` as MPL-2.0. Do not copy a different application's release into distribution assets without matching version, notice and regression checks. A newer upstream release is not silently installed by this feature. Public APIs are preferred; private helpers or application code require exact-version compatibility checks.

When the local editor owns typing, set `focusOnClick` appropriately and keep the canvas blurred so its Keyboard handler does not emit a second copy. Restore normal canvas/hardware input only after editing ends for the current controller. The local text bridge and hardware-key helper must have one explicit emission path for each operation. Keep noVNC input logging disabled: 1.5.0 logs keysyms at info/debug levels (`core/rfb.js:476-484`, `core/input/keyboard.js:50-53`), while its logger defaults to warn (`core/util/logging.js:13`).

### Feasibility before the mobile implementation

A later authorized implementation first evaluates the reuse boundary above, then probes only the missing metadata/binding layer using a synthetic page and disposable owned human-mode session. Test a private AT-SPI adapter with the installed sandboxed Chromium. Establish that a private session bus restricts discovery to owned browser processes and that visible, enabled, editable controls expose usable bounds and safe input flags. Field values and editable text are never requested. Check browser chrome, password controls, textareas, contenteditable and cross-origin frames. A role alone does not prove that a hidden, covered, readonly or disabled control is usable.

Prepublish candidate regions to the authenticated controlling viewer. Within the original tap's trusted event, focus a real local editor synchronously and deliver the corresponding remote caret-placement action under current input authority. Unknown/noneditable regions do not open the phone keyboard. Prove this with a previously closed keyboard and after reconnect, tab switch and orientation change on both actual phone browsers. Desktop emulation is insufficient.

The probe must establish coherent framebuffer/metadata generations, invalidation/freshness rules, remote-focus acknowledgement and enforced serialization with the actual RFB pointer/key path. Chromium documents that its native accessibility cache can lag rendering. If the required controls/modes cannot be identified, the single-controller transaction cannot protect the bound target or a native keyboard requirement fails, stop with that observed failure. The owner decides any changed scope, instrumentation, privacy or dependency boundary. CDP, extensions and keyboard-button fallbacks are excluded. WebKit's historical user-gesture rule motivates synchronous local focus; its native embedding-client exception does not establish ordinary Safari webpage behavior.

### Input ownership and field binding

The most recently focused eligible viewer acquires one session-wide input authority. A visible, focused viewer requests control on focus or an intentional tap within its viewer; the supervisor serializes authenticated claims in receipt order, and the last granted claim wins. A grant returns a new controller epoch tied to that viewer connection and current browser phase. Blur, page hiding, disconnect, expiry, handoff or process-identity loss revokes that grant. A noncontroller cannot acquire authority merely by sending a key. Viewers with stale authority remain watch-only until a fresh focus claim succeeds.

Apply this policy to actual server-bound input, including ordinary RFB pointer/hardware keys, mobile binding/text, supplemental keys and clipboard mutations. Set losing clients `viewOnly` for normal UI feedback, but reject their input at the owned supervisor/server boundary as well. First evaluate x11vnc native per-client permissions: the installed manual documents `-input` K/M/B/C/F and remote `client_input:str` for per-client K/M/B (`x11vnc.1`, decompressed lines 918-929 and 5925-5929). Prove a trusted mapping from each owned viewer WebSocket/upstream connection to its server client ID; a shared loopback address or viewer-supplied ID is insufficient. Prove synchronous disable, a barrier for already queued input, and re-enable for the new epoch before relying on those controls. Preserve `-nosel`; the remote per-client K/M/B command alone does not establish clipboard coverage. If native permissions cannot supply the necessary mapping/barrier, record that gap before designing the smallest enforcing adapter around existing transport. A replacement RFB client/codec is excluded. The sizing controller currently arbitrates only viewport requests; it is not evidence of existing input enforcement.

All accepted input shares the same session sequencer and controller epoch. A control transfer first fences the previous epoch, cancels unsent edits/composition, releases its held buttons/modifiers and invalidates its binding, then enables the new controller. Its first pointer/key event cannot overtake that fence. A rejected event produces no remote input or binding mutation. In-flight input either finishes on its original target before transfer or is cancelled; it never follows another viewer's click to a new field.

The selected field has an opaque target identity bound to controller epoch, browser phase, tab/focus context and geometry generation. The initial tap places the remote caret, and a remote-focus acknowledgement must confirm that exact target/context before buffered text can be released. Ordinary pointer/key events from the controller also participate in the sequencer: before an action can change focus/caret/selection, invalidate or safely finish the preceding edit transaction; a subsequent field needs a fresh binding. Remote focus changes outside that transaction cancel it. Checking focus and later emitting unrestricted global keys is not sufficient; the feasibility gate must prove target-safe delivery on the actual transport or stop.

Use ordered operation identities to reject duplicates/replays. Ambiguous delivery/acknowledgement is not blindly retried. Context change, timeout and disconnect discard unsent transient text, clear the local editor and report that typing was not sent. Reconnect and browser handoff create fresh epochs and never resume an old composition or buffered text. Concrete protocol, bounded buffer limits and expiry timings must be established by the probe and recorded before the remaining implementation continues.

### Metadata, privacy and viewport behavior

A private bus/helper belongs to one session and verified browser process lineage. Never attach to workstation applications or another session. Metadata contains only opaque local target identity, editable/visible/enabled state, bounds and a fixed allowlist of safe input-mode flags. It contains no values, text, labels, accessible names/descriptions, page URLs or serialized tree.

For an eligible control on the verified Chromium connection, the private helper may call AT-SPI `Accessible.GetAttributes` when the role and state do not identify the required keyboard mode. Chromium returns the type alongside other attributes such as page-authored descriptions and input names. The reply may exist only in the helper's transient memory for that operation. Map `text-input-type` to a fixed enum, discard the reply and expose only the enum. When the map is needed, an unknown or missing type does not authorize a keyboard mode. Never forward or retain the reply or unrecognized values, including on errors. Deny attribute reads on unverified connections and ineligible controls. Direct reads of names, descriptions, URLs, values or text, text-bearing subscriptions and bulk tree caches remain excluded. Keep text transient and out of logs, diagnostics, storage, recordings and agent tooling. Never read an existing password or remote field value to synchronize the local editor.

Navigation, tab change, scroll, reflow, popup occlusion, resize, handoff and ownership change invalidate affected geometry/bindings. An expired or incoherent map cannot authorize editing. Unknown regions never trigger a speculative keyboard; temporary unavailability must recover without treating a second tap as accepted behavior. Apply session identity, origin, method, expiry, controller epoch and process-ownership checks to every metadata, claim, binding and input interface, including WebSocket input if used.

Handle committed text, composition, deletion and correction through the upstream-based local bridge with one edit per user operation. Use native editing/input-mode APIs for the safe field type, with Unicode/grapheme-safe adaptation where upstream behavior needs it. Password local editors disable text prediction, capitalization and spelling correction. No local mirror of existing remote text is created. Prove native mode behavior against an ordinary local phone control of the same type/hints on that OS/browser/keyboard; unsupported behavior is a failed criterion requiring a scope decision.

The local editor keeps focus through keyboard animation and adaptive resizing. Extend the existing canvas-focus guard for editing and the Clipboard panel. Dismissal stays effective until an intentional editable tap. Keep remote caret/selection replacement usable without claiming native phone selection handles or remote DOM widgets. Normal one-finger movement scrolls at the touched remote scroller; a deliberate hold followed by movement selects/drags remotely. Reuse upstream recognition and map only these differing actions, suppressing the default duplicate mouse drag/wheel path. Coordinate mapping remains correct through zoom, scaling, orientation, keyboard changes and nested frames. The field and form action stay reachable without a resize/focus loop.

### Failure, compatibility and delivery

A missing/failed adapter gives a fixed content-free diagnostic and leaves mobile editing unavailable. It does not enable debugging, disable the sandbox, install dependencies, alter authentication or expose a broader bus. Document prerequisites and separately approved additions without global changes. Partial startup, stop and expiry clean only owned helper/bus resources; cleanup failure remains visible.

Existing supervisors keep their running version; a package update applies to new sessions. No persistent input/profile format change is proposed. Rollback loses mobile interaction but must not replay text or leave new helpers. Desktop control remains usable under the accepted single-controller policy; service shares are unchanged.

The affected artifact is the independent remote-gui marketplace package, including its helper-built binary, assets, instructions and approved dependencies. Marketplace sources point to `plugins/remote-gui/`; `scripts/remote-gui.sh:34-49` builds installed source with CGO and downloads disabled. `.github/workflows/ci.yml:112-153` checks the module/package and owned browser fixtures. Validate that actual packaged path and the noVNC asset/version pairing. Package publication, release and installation remain separate steps.

## Acceptance Criteria

- [ ] AC-01: On actual current iOS Safari and Android Chrome, the first intentional tap on every supported remote editable control opens the actual native phone keyboard and places the remote caret, including with a previously closed keyboard and after reconnect; ordinary content, buttons, scrolling and readonly/disabled/hidden/covered controls do not open it, and no keyboard toggle, second tap or every-tap activation is required.
- [ ] AC-02: Native typing with field-appropriate text, email, URL, search, telephone and numeric keyboard modes, secure password entry, correction, IME composition, accented text, emoji, deletion, caret movement and selection replacement produce the intended remote text once, in order, without exposing existing contents or losing text during normal acknowledged editing.
- [ ] AC-03: One-finger swipe scrolling and deliberate hold-and-drag selection/dragging control the intended remote target through scaling, zoom, orientation and nested frames, without unintended clicks or keyboard activation; supplemental controls send only required keys absent from the phone keyboard.
- [ ] AC-04: Keyboard opening, dismissal and adaptive viewport changes keep editing focus stable, the active field/form action reachable and Clipboard-panel input isolated; dismissal stays effective until a later intentional editable tap, with no resize/focus loop.
- [ ] AC-05: Human-mode mobile interaction keeps automation, CDP and extensions disabled and the Chromium sandbox intact; every new metadata, controller, binding and input path remains private to owned processes and the authorized viewer, with only the approved editable metadata leaving the private helper and no prohibited metadata or typed-text retention in logs, diagnostics, storage or agent tooling.
- [ ] AC-06: Only the current focused controller can mutate remote input through either ordinary RFB or mobile paths; control transfer, stale geometry, delayed focus acknowledgement, concurrent viewers, duplicate/lost requests, reconnect, handoff, expiry and ownership changes cannot duplicate text or deliver it to another target/context, and unsent input is cancelled and cleared with an honest failure indication.
- [ ] AC-07: The independently installed package validates prerequisites and fails without privacy changes or automatic tool installation; startup failure, stop, expiry and rollback clean only owned resources and preserve controller desktop input, existing profiles, unrelated routes and service shares.
- [ ] AC-08: The documented verification path covers the accepted scope with reproducible synthetic fixtures, Chromium/Firefox desktop regressions and actual current iOS Safari/Android Chrome evidence; terminology and support claims match results and exclude unimplemented autofill, passkey and native-picker integration.
- [ ] AC-09: The installed viewer reuses noVNC's existing streaming, input/keysym, focus, gesture and applicable text-bridge capabilities and the existing Clipboard path; adaptations have a demonstrated gap, version compatibility and preserved licensing, and local-editor typing does not run a duplicate canvas/hardware or gesture emission path.

## Test Plan

These are planned proofs, not executed mobile results. Later evidence records the implementation commit, installed package/noVNC identity, prerequisites, actual phone model, OS/browser version, keyboard/IME and settings. Use synthetic text and owned disposable sessions; do not capture real sign-in input.

| Criterion | Proof |
| --- | --- |
| AC-01 | Gate F1: after a later implementation request, perform the upstream reuse evaluation, then the Design's isolated metadata/local-input/control probe on actual current iOS Safari and Android Chrome. Close the keyboard before each text/password/email/URL/search/tel/number/textarea/contenteditable/address-field/cross-origin-frame first tap; repeat after reconnect, tab switch and orientation change. Require one tap to open the OS keyboard and place the intended remote caret. Tap buttons, text and readonly/disabled/hidden/covered regions and perform normal one-finger scrolling. Any routine extra tap/toggle or noneditable activation fails. |
| AC-02 | Scenario M2: for text, email, URL, search, tel, numeric and password, compare actual keyboard layout/action behavior with an ordinary synthetic local control of the same type/hints in the same OS/browser/keyboard configuration; verify type transitions while the keyboard remains open. Explicitly observe all required modes and verify password entry has no prediction, autocapitalization or spelling correction; an unsupported mode remains failure requiring an owner scope decision. Enter/edit accents, multi-codepoint emoji and a non-Latin IME through intermediate composition, correction, deletion, caret repositioning and selected-text replacement. Compare the synthetic remote result after each operation. Rapid typing behind delayed focus ACK must arrive once at the bound field. |
| AC-03 | Scenario M3: in an owned synthetic page with nested scrollers and cross-origin frames, use one finger to scroll vertically/horizontally without first enabling a mode; verify remote scroll results and zero pointer-button clicks. Deliberately hold then drag to select/drag, and tap to place the caret. Repeat before/during editing, portrait/landscape, scale and 200 percent browser zoom. Verify no duplicate default noVNC drag/two-finger-wheel path fires for an adapted gesture. Exercise each supplemental key and assert its remote result. |
| AC-04 | Scenario M4: on both phones open/dismiss/reopen the keyboard, change fields, rotate during composition, scroll a low field/action into view and type in the Clipboard panel. Verify stable focus, visible/reachable field/action, no clipping/overflow and no repeated resize/reopen loop. Automate viewport/focus boundaries in Chromium/Firefox; inspect synthetic screenshots at 320x568,390x844,390x667,844x390,768x1024,1280x720,1440x900 plus actual device dimensions and 200 percent zoom. |
| AC-05 | Scenario S5: inspect owned launch flags/processes and exercise every actual metadata, controller, binding and input endpoint/channel introduced by the probe, including ordinary input WebSockets. For each, attempt wrong method/origin, foreign identity, forged ingress header, expired session, stale/noncontroller authority and changed process/bus ownership. Require refusal plus zero remote input, clipboard, controller or binding mutation. Assert human no-CDP/automation, extensions disabled and sandbox intact. Instrument synthetic accessibility access to reject direct value/name/description/URL reads, text-bearing events and raw-tree or bulk-cache reads. Allow the object attribute map only for verified eligible controls. Seed unrelated attributes beside a recognized type and require only the allowlisted enum across the helper boundary. Check missing, unknown and injected type strings, and assert that the raw reply and unrelated attributes never appear in IPC, responses, logs, retained records, storage or artifacts, including upstream key logging. Never query an unrelated application's bus. |
| AC-06 | Scenario S6: deterministically reorder/expire geometry, change scroll/reflow/tab/popup state, delay focus ACK, lose ACK after delivery and duplicate/replay input. On an actual owned browser with two real RFB viewer connections, let A bind field A and enqueue an acknowledged/in-flight edit; focus B and send ordinary RFB pointer and hardware-key events into field B while authority transfers. Require either completion on field A before transfer or cancellation, zero A-text in field B, zero stale-controller mutation, released held keys/buttons and no duplicate delivery. Also race same-controller click/key focus changes with buffered edits and inject direct RFB events from the losing client despite its `viewOnly` UI. Repeat reconnect, handoff, expiry and changed process identity; fresh bindings are mandatory and buffers clear. |
| AC-07 | Scenario P7: copy the package outside Git and run its real helper with existing verified tools, following `tests/remote-gui/package.test.ts`. Test missing/failed adapter, partial startup/cleanup, stop/expiry, an old supervisor beside a new session and rollback after ending the new session. Assert no install/global changes or leftover helper/bus, preserved unrelated resources, and hardware/pointer use by the current controller. Run module race/vet/lint/tidy, package checks and affected desktop/Clipboard/profile/handoff/service-share regressions through the documented suite. |
| AC-08 | Read the final README/skill, fixture commands, setup guidance, endpoint schemas and marketplace/version declarations against packaged behavior. Follow its documented aggregate verification path. Require AC-01 to AC-07/AC-09 evidence and Chromium/Firefox console/layout/focus checks; missing real phones remain blockers. Verify glossary meanings and the distinction between real OS keyboard proof, emulation and excluded integrations. |
| AC-09 | Scenario U9: inventory the actual installed noVNC version/APIs/helpers and license notices before the metadata prototype. Evaluate x11vnc native `client_input` permissions using two owned connections on the same loopback address, prove connection/client-ID attribution and a synchronous disable/drain/re-enable transfer barrier, and separately verify manual clipboard authorization and retained `-nosel`; documentation of flags alone is not a pass. Against that package's real modules, verify reused key/keysym, focus and gesture behavior; check every adapter against a demonstrated missing capability. Verify no new parallel codec/recognizer/clipboard stack. During local typing, count resulting synthetic remote edits while both input and keyboard events occur, including composition, cancellation and focus restoration; require exactly one intended emission. Check license/version/source pairing in an independently installed package; a stub RFB fixture alone cannot pass this proof. |

## Tasks

- [ ] T1 `tests/remote-gui/mobile-feasibility/` and `docs/specs/remote-gui-mobile.md` - evaluate the installed noVNC bridge and x11vnc permissions, then run the private geometry and input-binding probe against the synthetic fixture. Gate F1 must show selective first-tap native keyboard opening on both physical phones and safe delivery through the actual input boundary before T2 starts (AC-01, AC-05, AC-06, AC-09)
- [ ] T2 `plugins/remote-gui/internal/browser/`, `plugins/remote-gui/internal/proxy/` and `tests/remote-gui/` - implement the proven controller fence and private editable metadata path. S5 and S6 must show that unauthorized and stale input cannot mutate the session (AC-05, AC-06)
- [ ] T3 `plugins/remote-gui/internal/proxy/` and `tests/remote-gui/` - connect the local editor to noVNC and the confirmed remote target. AC-01 and M2 must pass on both phones, with one remote edit per intended operation in U9 (AC-01, AC-02, AC-09)
- [ ] T4 `plugins/remote-gui/internal/proxy/` and `tests/remote-gui/` - adapt noVNC touch gestures and preserve editing across viewport changes. M3 and M4 must pass with keyboard dismissal, reachable controls and no duplicate events (AC-03, AC-04)
- [ ] T5 `plugins/remote-gui/` and `tests/remote-gui/` - verify the independent package, document prerequisites and run the full desktop and phone procedure. P7 and the documented aggregate verification must pass against the package delivered by the helper (AC-05, AC-07, AC-08, AC-09)

## Open Questions

None. The owner accepted keyboard/touch scope first, both platform targets and one focused viewer controlling all input. Exact device/version records and feasibility evidence remain implementation prerequisites, not assumed successful results.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-19 | R-1 | spec | `363a6140f6c2a1383da8d9c1fee5f2d3c36fa0fa` | unknown | procedural | Three should-fix findings preserved; applied in the subsequent owner-directed revision, awaiting a new independent review. |
| 2026-11-19 | R-2 | spec | `3fa0bae68d8c1d25d9255c2d90cd1ec0b9d06886` | unknown | procedural | No findings; model identity was not attested. |
| 2026-11-19 | R-2 | spec | `3fa0bae68d8c1d25d9255c2d90cd1ec0b9d06886` | n/a | n/a | accepted by owner |
| 2026-11-19 | R-3 | spec | `0708e3cb33dd1fe1e85f4e8da74b598ee32f96a0` | unknown | procedural | No findings after covered-source drift; model identity was not attested. |

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
