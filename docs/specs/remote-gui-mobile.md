---
status: draft
status_description: "Three review findings and owner scope, device and input-policy answers remain open; native-keyboard feasibility is unproven."
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

A phone should behave like a browser when it controls a remote-gui session. The first tap on a remote textbox must open the actual phone keyboard. A separate keyboard button, a second activation tap and opening the keyboard on every page tap do not meet this requirement. Additional controls provide only keys the phone keyboard lacks.

The proposed first scope includes native typing, composition, deletion, caret placement, selection, touch scrolling and keeping the active field usable as the keyboard opens or closes. Phone autofill, passkeys, camera integration and native file or select pickers are separate capabilities. That scope recommendation and the available phone/browser test devices still await the owner's answers in Open Questions.

The candidate design uses a session-owned Linux accessibility adapter to publish only editable geometry and limited input metadata. The viewer uses that information to focus a local editing element during the original tap, then sends the owner's input to the selected remote field. Human mode keeps debugging and automation disabled, and extensions stay disabled. The adapter must not read field contents, labels, URLs or a raw accessibility tree into retained output or agent tooling.

This architecture is unproven. Installed accessibility libraries and upstream APIs establish a possible route, not working integration with the sandboxed Chromium or current phone browsers. After acceptance, the first implementation activity is an owned synthetic feasibility probe. It must demonstrate selective first-tap keyboard activation on real current iOS Safari and Android Chrome. Failure stops the work for an owner decision; it never silently enables CDP or substitutes a keyboard toggle.

Independent review R-1 found three should-fix issues: competing viewers' ordinary input, native keyboard-mode proof and security checks across all new routes. The reviewer's model identity was not attested and is recorded as unknown. The draft is not accepted. Owner answers on scope, available devices and competing-viewer control remain pending. No mobile code or device proof exists from this work. Acceptance would authorize the synthetic probe and implementation within the accepted scope if that probe passes. It would not authorize package installation, relaxed privacy boundaries, release, deployment or unrelated browser activity. New sessions would receive the later installed implementation; existing running supervisors keep their original code.

### Background

At default-branch commit [cdf8956](https://github.com/michielvha/vh-adlc/commit/cdf89564a5d079340922584c83f183ca4ffa8cc2), the viewer imports noVNC's RFB core and connects a canvas. Its local textarea belongs to the Clipboard panel; resize restores canvas focus except while that panel owns focus (`plugins/remote-gui/internal/proxy/viewer.go:30,39-45,118-128`). RFB canvas focus does not itself open an operating-system software keyboard. The installed noVNC 1.5.0 application separately implements a local input bridge and keyboard toggle (`app/ui.js:1439-1596`), which the custom viewer does not load.

Adaptive sizing is separate prerequisite work in [PR 121](https://github.com/michielvha/vh-adlc/pull/121), observed open at [d9849b1](https://github.com/michielvha/vh-adlc/commit/d9849b1be481b5bfea02f7b7e566f33ac3668cf2) on 2026-11-19. Its reviewed implementation at [e2ac2d7](https://github.com/michielvha/vh-adlc/commit/e2ac2d757750d3495a1167dfd5ea29674ad68ca1) and committed state at [417c4c4](https://github.com/michielvha/vh-adlc/commit/417c4c4e61bef22946b5e26e205c68e9ad1e77df) fit the viewer to the visual viewport and resize the owned X11 browser (`plugins/remote-gui/internal/proxy/viewer.go:122-207` at 417c4c4). Those commits do not establish native phone keyboard behavior. The PR is not merged, released or installed. At mobile implementation intake, verify the required adaptive-sizing backend exists in the selected implementation base; otherwise wait for its separately authorized merge. Do not infer its presence from this draft's publication on the default branch.

Human Chromium launches with extensions disabled, and only agent mode adds automation and loopback debugging flags. Launch validation rejects those flags in human mode (`plugins/remote-gui/internal/browser/phase.go:20-58` at cdf8956). Existing X11 helpers handle clipboard, menus and native windows; they do not expose page-editable semantics (`plugins/remote-gui/internal/xclip/xclip.go:1-5`, `menus.go:1-16`). Owner identity and expiry checks precede viewer access (`plugins/remote-gui/internal/proxy/proxy.go:289-315`, `identity.go:17-67`).

Read-only host checks found Python `gi`, `pyatspi` and `dbus`, AT-SPI libraries, `dbus-run-session` and the AT-SPI bus launcher/registry. No accessibility bus or tree was queried, and no GUI session was opened for this research. Other hosts may lack these dependencies.

## Scope

The required core is selective first-tap native keyboard activation, correct input delivery and preservation of the existing human/agent and owner-access boundaries. The proposed first scope below remains subject to Q1 and Q2.

- Support ordinary editable text, password, email, URL, search, telephone and numeric fields, textareas, contenteditable regions, browser address/search fields and editable fields in cross-origin frames on the accepted phone/browser matrix.
- Preserve text insertion, composition, correction, deletion, remote caret placement and selection replacement. Safe metadata must select the corresponding text, email, URL, search, telephone or numeric phone-keyboard mode.
- Support direct touch scrolling and the existing adaptive sizing while keeping editing focus, the active field and form actions reachable.
- Provide supplemental controls only for required keys unavailable on the active phone keyboard, such as modifiers, Escape, Tab or arrows. Their exact presentation follows the proved interaction needs; no general keyboard activation button is added.
- Preserve desktop pointer/hardware-keyboard input, the Clipboard panel, browser handoff and private session cleanup.

Proposed exclusions pending Q1: phone password-manager/autofill integration, passkey forwarding, camera/microphone integration, native phone select/file pickers, download redesign, custom drawn editors without useful editable semantics, changes to service-share applications, a native phone app and replacement of noVNC/VNC streaming. This feature makes no universal claim about arbitrary inaccessible web applications.

| Term | Meaning |
| --- | --- |
| Native phone keyboard | The phone operating system's software keyboard, opened by the viewer's local editing element. |
| Supplemental keys | Controls that send required remote keys absent from the active phone keyboard. |

## Design

### Feasibility before the mobile implementation

After spec acceptance, use an isolated synthetic page and disposable owned human-mode session to test a geometry-only AT-SPI adapter with the installed sandboxed Chromium. Establish that a private session bus can restrict discovery to owned browser processes, and that visible, enabled, editable controls expose usable bounds and safe type hints without retrieving their text. Check browser chrome, textareas, contenteditable, password controls and cross-origin frames. Merely observing an editable accessibility role is insufficient for hidden, covered, readonly or disabled elements.

Prepublish the candidate regions to an authenticated viewer. In the same trusted tap that selects a current editable region, focus a real local editor synchronously. Keep the native phone keyboard closed on noneditable taps. Prove this with a previously closed keyboard, after reconnect and after orientation changes on real iOS Safari and Android Chrome. Desktop emulation does not establish native keyboard activation.

The probe must also demonstrate a workable association between displayed geometry and editable metadata, and safe remote-focus acknowledgement before text delivery. Chromium documents that its native accessibility cache can lag rendering. The probe must establish the necessary invalidation and freshness rules before the full implementation proceeds. If stale geometry cannot be handled safely, required controls cannot be identified, or native activation fails on the accepted devices, stop with the observed failure. The owner decides any changed scope, instrumentation, privacy or dependency boundary. CDP, extensions and keyboard-button fallbacks are not part of this proposal.

This is a proposed engineering route. The proof determines adapter/API and protocol details; the draft does not claim existing Chromium accessibility or current Safari behavior has passed it. WebKit's historical user-gesture restriction motivates synchronous local focus. Its native embedding-client exception does not establish an exception for an ordinary Safari webpage.

### Input and geometry boundaries

Keep the RFB framebuffer and ordinary pointer transport. Add the smallest metadata and input interfaces the probe proves necessary through the existing authenticated supervisor/viewer boundary. A private accessibility bus and helper belong to one session and its verified browser process lineage; never attach to the workstation's unrelated applications or another session's bus.

Metadata contains only opaque session-local target identities, editable/visible/enabled state, bounds and a fixed allowlist of safe input-mode flags. It contains no values, text, labels, accessible names/descriptions, page URLs or serialized tree. Avoid accessibility subscriptions and bulk-cache calls that pull those fields or text-bearing change events. Do not log metadata payloads or input contents. Raw accessibility dumps and screenshots of real sign-in are not verification artifacts.

Each editable map is bound to the current browser phase, tab/focus context and framebuffer geometry generation. Navigation, tab change, scroll, reflow, popup occlusion, resize, handoff, reconnect or loss of ownership invalidates affected targets. An expired or invalid map cannot authorize input. A fresh coherent map is required before accepting a new editable tap; unknown regions never trigger a speculative keyboard. This unavailable state is a failed supported interaction until it recovers, not an accepted second-tap workaround.

The original tap must still place the remote caret. The viewer may hold bounded transient input while the selected remote field gains focus, but it sends nothing until an acknowledgement binds that field to the same current context and geometry. Later text carries ordered input identity for that binding. Duplicate requests cannot insert twice; ambiguous acknowledgement or lost delivery is not blindly replayed. Context changes, cancellation, timeout and disconnect discard unsent input, clear the local editor and report that typing was not sent. They never retarget it to the newly focused field. Exact bounds, expiry timing and acknowledgement mechanism must be established by the probe and recorded before implementation continues.

Only the active controlling viewer can bind editing input; concurrent viewers cannot interleave text into one field. Reuse the sizing controller's ownership where possible and clear the losing viewer's edit state when ownership changes. Reconnect and browser handoff create fresh bindings and never resume an old composition or retry buffered text across phases. Metadata and input access remain subject to session identity, origin, method, expiry and current process ownership checks. No endpoint becomes reachable through a forged browser header or a different tailnet user.

### Editing and viewport behavior

Handle committed text and composition events, including deletion and correction, rather than assuming every software keyboard emits hardware key events. Ensure one remote edit per user operation, with Unicode and grapheme-safe handling. Local transient input must not become a copy of existing remote field contents. Password targets use secure local editing semantics without prediction, capitalization or spelling suggestions; never read the existing remote password to synchronize state.

The local editor keeps focus through keyboard animation and adaptive resizing. Extend the current canvas-focus guard so neither resize nor reconnect steals focus from active editing or the Clipboard panel. Keyboard dismissal does not immediately reopen it; a later intentional editable tap can reopen it. Remote field changes update or end the binding safely. Maintain the remote caret and replacement selection without duplicating the native keyboard UI or pretending local selection menus are full phone-native remote DOM integration.

Touch gestures distinguish a tap from scrolling and dragging. Scrolling page content must not click a field or open the keyboard. Coordinate mapping stays correct through scaling, browser zoom, orientation, virtual-keyboard changes and scrolling; it includes browser chrome and nested frames. The active field and form action remain reachable in the available visual viewport without a resize/focus feedback loop. Supplemental controls preserve the editing binding and send only their stated missing keys.

### Failure, compatibility and delivery

A missing or failed adapter gives a fixed, content-free diagnostic and leaves native mobile editing unavailable. It does not start debugging, disable the Chromium sandbox, install dependencies, alter provider authentication or expose a broader bus. An implementation must document host prerequisites and any separately approved additions without changing global configuration automatically. Partial startup cleans only owned helper/bus resources, and stop/expiry removes them with the session. Failed cleanup remains visible.

Existing installed supervisors continue running their own version. A later package update applies only to new sessions. No persistent input state or reusable-profile format change is proposed; rollback to the earlier package loses mobile interaction and must not replay text or leave new helper processes behind. Desktop and service-share behavior remains compatible.

The affected artifact is the independently installed remote-gui marketplace package, including its helper-built binary, assets, instructions and any approved new runtime dependency. The marketplace sources point to `plugins/remote-gui/`; `scripts/remote-gui.sh:34-49` builds that installed source with CGO disabled and downloads disabled. `.github/workflows/ci.yml:112-153` checks the module, package and owned browser fixtures. Validate the actual packaged helper path, not just a source-tree binary. Version declarations, package checks, CI and setup guidance must agree before later shipment. Publication and installation are separate authorized steps; this draft performs neither.

## Acceptance Criteria

- [ ] AC-01: On the accepted real-phone/browser matrix, the first intentional tap on every supported remote editable control opens the actual native phone keyboard and places the remote caret, including with a previously closed keyboard and after reconnect; ordinary content, buttons, scrolling and readonly/disabled/hidden/covered controls do not open it, and no keyboard toggle, second tap or every-tap activation is required.
- [ ] AC-02: Native typing with field-appropriate text, email, URL, search, telephone and numeric keyboard modes, password entry, correction, IME composition, accented text, emoji, deletion, caret movement and selection replacement produce the intended remote text once, in order, without exposing existing field contents or losing text during normal acknowledged editing.
- [ ] AC-03: Touch scrolling and tap/drag interactions control the intended remote target through scaling, zoom, orientation and nested frames; scrolling does not become an unintended click or keyboard activation, and supplemental controls send only required keys absent from the phone keyboard.
- [ ] AC-04: Keyboard opening, dismissal and adaptive viewport changes keep editing focus stable, the active field and form action reachable, and Clipboard-panel input isolated; dismissal stays effective until a later intentional editable tap, with no resize/focus loop.
- [ ] AC-05: Human-mode mobile interaction keeps automation, CDP and extensions disabled and the Chromium sandbox intact; editable discovery and new routes remain private to the session's owned processes and authorized viewer, with no field-value, label, URL, raw-tree or typed-text retention in logs, diagnostics, storage or agent tooling.
- [ ] AC-06: Stale geometry, delayed focus acknowledgement, concurrent viewers, duplicate/lost requests, disconnect, reconnect, handoff, expiry and process-ownership changes cannot duplicate input or deliver it to another field, phase, session or viewer; unsent text is cancelled and cleared, with an honest failure indication.
- [ ] AC-07: The independently installed package validates its prerequisites and fails without changing host privacy or installing tools; startup failure, stop, expiry and rollback clean only owned new resources and preserve desktop input, existing profiles, unrelated routes and service shares.
- [ ] AC-08: The package's documented verification path covers the accepted scope with reproducible synthetic fixtures, Chromium/Firefox desktop regression checks and real current iOS Safari/Android Chrome device evidence; its terminology and advertised support match observed results and never claim autofill, passkey or native-picker integration from a keyboard bridge.

## Test Plan

All proofs below are planned. None ran for this draft. Record the implementation commit, installed-package identity, host prerequisites, phone model, OS/browser version, keyboard/IME and actual device in later evidence. Use only synthetic text and owned disposable sessions; disable recordings and input logging for real sign-in.

| Criterion | Proof |
| --- | --- |
| AC-01 | Gate F1: after acceptance, run the Design's isolated accessibility/local-input probe on actual current iOS Safari and Android Chrome. On a synthetic control matrix, close the keyboard before each text/password/email/URL/search/tel/number/textarea/contenteditable/address-field/cross-origin-frame first tap; repeat after reconnect, tab switch and orientation change. Verify one tap opens the OS keyboard and the remote caret lands at the intended point. Tap buttons, text, readonly/disabled/hidden/covered regions and scroll. Any routine extra tap/toggle or noneditable activation fails the gate. |
| AC-02 | Scenario M2: on both actual phone browsers, enter and edit synthetic text with accents, a multi-codepoint emoji and a non-Latin IME, including intermediate composition, correction, backspace, forward deletion where available, remote caret repositioning and selected-text replacement. Compare the synthetic remote result with the intended string after each operation. Cover password and numeric/email modes without reading existing values through the metadata adapter. Verify rapid typing after a delayed focus acknowledgement is delivered once to the bound field. |
| AC-03 | Scenario M3: in an owned synthetic page with nested scrollers and cross-origin frames, tap, drag and scroll vertically/horizontally before and during editing at phone portrait/landscape sizes. Check remote coordinate/caret results after scale and 200 percent browser zoom; verify no accidental click/keyboard on scrolling. Exercise each exposed supplemental key and assert its remote result and that ordinary typing still uses the OS keyboard. |
| AC-04 | Scenario M4: on both phones, open/dismiss/reopen the keyboard, move between fields, rotate during composition, scroll a low field/action into view and open/type/close the Clipboard panel. Verify editor focus, visible/reachable field and action, no horizontal overflow or clipped controls and no repeated resize/reopen loop. Automate visual-viewport and focus boundaries in Chromium/Firefox fixtures; inspect synthetic screenshots at 320x568, 390x844, 390x667, 844x390, 768x1024, 1280x720 and 1440x900, plus actual device dimensions and 200 percent zoom. |
| AC-05 | Scenario S5: inspect the owned fixture launch flags/processes and exercise actual metadata routes with owner, foreign identity, forged headers, wrong origin, expired session and foreign process/bus fixtures. Assert no CDP in human mode, extensions disabled and sandbox intact. Instrument synthetic accessibility access to reject value/name/description/URL/text-event/raw-tree reads; place distinct synthetic sentinels in those fields and typed input, then verify all retained records, diagnostics, browser storage and artifacts contain none. Confirm an unrelated application's bus is never queried. |
| AC-06 | Scenario S6: deterministic adapter/transport fixtures reorder metadata, expire generations, change scroll/reflow/tab/popup state, delay focus ACK, lose ACK after delivery, duplicate/replay input and race two viewers. Verify the intended target receives at most the acknowledged ordered edit, unrelated targets receive none, and unavailable/ambiguous delivery is reported without replay. Repeat with actual owned browser reconnect, handoff, expiry and changed process identity; buffers and bindings must clear and no text crosses contexts. |
| AC-07 | Scenario P7: copy the complete package outside Git and invoke its real helper using existing verified tools, as `tests/remote-gui/package.test.ts` does. Test missing/failed adapter, partial startup and cleanup, normal stop/expiry, an old running supervisor beside a new session, and reverting the installed package after the new session ends. Assert no dependency installation/global changes, no leftover owned bus/helper, and preserved unrelated processes/routes. Run module race/vet/lint/tidy checks, independent package checks, and affected desktop pointer/keyboard/clipboard/profile/handoff/service-share regressions through the documented suite. |
| AC-08 | Documentation/package review: read the final README, skill, fixture commands, host guidance, metadata schemas and marketplace/version declarations against installed-package behavior. Follow the aggregate documented verification path on an owned fixture. Require AC-01 to AC-07 evidence on the accepted matrix and Chromium/Firefox console/layout/focus regressions; keep missing phones and skipped checks explicit. Verify the glossary meanings and that no support statement substitutes desktop emulation for an actual OS keyboard or claims the proposed exclusions as implemented. |

## Tasks

None yet; written once the document is planned. The first implementation task must establish Gate F1 before the remaining mobile implementation proceeds.

## Open Questions

### Q1: Should the first delivery cover keyboard editing and touch interaction while other phone integrations remain separate work?

**Recommendation:** A. Complete the required keyboard, editing and touch behavior before adding capabilities with separate browser/security integration.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Keyboard and touch first** | The core experience specified here, with explicit exclusions for autofill, passkeys, camera and native pickers. | Those integrations need later scope and proof. |
| **B. Include further phone integrations** | A broader first delivery with the particular integrations the owner selects. | Revised design, criteria, privacy boundaries and a larger device test matrix before acceptance. |

**Why this is yours:** The requested browser-like experience can imply capabilities beyond keyboard transport. The owner's pending answer determines the first product scope; the selective first-tap keyboard requirement is already fixed.

### Q2: Which real phones and browser versions can establish the required device acceptance?

**Recommendation:** A. Retain actual current iOS Safari and Android Chrome as acceptance targets and name available devices before accepting the plan.

| Option | You get | It costs |
| --- | --- | --- |
| **A. Validate both platform targets** | Evidence for the two required OS/browser keyboard paths, with concrete device/version records. | Access to an actual iPhone and Android phone, including a second tester if needed. |
| **B. Stage device evidence** | Draft/probe progress using whichever real device is available first. | The other platform remains an explicit delivery blocker; its evidence cannot be replaced by desktop emulation. |

**Why this is yours:** Only the owner can confirm the devices and testers available. No device model or successful keyboard behavior has been inferred from the resizing walkthrough.

### Q3: Should the most recently focused viewer control all remote input, or should viewers retain simultaneous control?

**Recommendation:** A. Give one focused viewer control of pointer, hardware-keyboard and mobile-editing input together so a second viewer cannot move focus beneath an acknowledged mobile edit.

| Option | You get | It costs |
| --- | --- | --- |
| **A. One controlling viewer** | The most recently focused viewer controls all remote input; other connected viewers watch until control transfers. | Existing simultaneous pointer/hardware-keyboard control changes, and the implementation must arbitrate the actual RFB input path. |
| **B. Simultaneous control** | Existing viewers keep sending ordinary pointer and hardware-keyboard input concurrently. | Any competing interaction must cancel or safely finish the bound mobile edit before remote focus changes; this requires proof on the actual RFB path. |

**Why this is yours:** This changes what multiple connected people or devices can do. The current sizing controller only arbitrates viewport requests; it does not already arbitrate ordinary pointer or hardware-keyboard events. R-1/F-01 remains unresolved until this choice and the corresponding proof are incorporated in one revision with the other review findings.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-19 | R-1 | spec | `363a6140f6c2a1383da8d9c1fee5f2d3c36fa0fa` | unknown | procedural | Three should-fix findings; owner input policy and proof corrections pending. |

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

## Sources

- [Pinned agent entry](https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/AGENTS.md) and [task routes](https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/README.md): required knowledge and authoring routes.
- [Pinned feature-document standard](https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/conventions/feature-documents.md), [template](https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/guides/feature-document-template.md), [documentation](https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/conventions/documentation.md), [delivery](https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/conventions/delivery.md), [frontend verification](https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/conventions/frontend-testing.md) and [humanize prose](https://github.com/vhco-pro/docs/blob/1ccf8f314575ece1f3fcc8e48c4fd804a1ca88ff/guides/humanize-prose.md): authoring, evidence and publication rules used for this draft.
- [noVNC overview](https://novnc.com/info.html) and [RFB API](https://novnc.com/noVNC/docs/API.html): mobile remote desktop and canvas input are existing capabilities; the core library differs from its complete application and exposes no editable-DOM map.
- [WebKit bug 195884](https://bugs.webkit.org/show_bug.cgi?id=195884), comments 4 and 6: historical user-gesture focus policy and the distinct native embedding-client case; not current device verification.
- [Chromium accessibility overview](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/accessibility/overview.md) and [inspection tools](https://chromium.googlesource.com/chromium/src/+/HEAD/tools/accessibility/inspect/README.md): native accessibility architecture, cache lag and Linux inspection support; not proof for this installed sandboxed browser.
- [AT-SPI state definitions](https://gnome.pages.gitlab.gnome.org/at-spi2-core/libatspi/enum.StateType.html) and [component bounds](https://gnome.pages.gitlab.gnome.org/at-spi2-core/libatspi/method.Component.get_extents.html): editable/visible state and screen/window geometry APIs.
- [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts): extension instrumentation introduces frame/permission requirements; no extension path is authorized by this proposal.
- [Guacamole user interface](https://guacamole.apache.org/doc/gug/using-guacamole.html) and [Kasm control panel](https://www.kasmweb.com/docs/develop/user_guide/control_panel.html): existing text-input and supplemental-key patterns, including explicit keyboard controls; these do not establish this feature's selective first-tap behavior.
