---
status: draft
status_description: "Revised for review R-1 with the owner's answers; waits for a new spec review and acceptance."
issue: https://github.com/michielvha/vh-adlc/issues/61
goal: "The owner can move text between their own device and the shared remote browser through explicit viewer controls, and the text never reaches logs, records or retained evidence."
covers:
  - plugins/remote-gui/
  - tests/remote-gui/
---

# Plan: Clipboard controls for the remote-gui viewer

Add an owner-initiated clipboard panel to the shared-browser viewer so the owner can send text into the remote browser and copy text back out, without automatic clipboard access on either side.

## Context

### Owner summary

Typing a long URL or token into the shared browser today means retyping it through the canvas. The viewer has no clipboard controls, even though the underlying noVNC library and x11vnc already exchange clipboard text.

This feature adds a small clipboard panel to the viewer page. The owner pastes text into a field on their own device and presses **Send to remote browser**; the text becomes the remote clipboard, ready for Ctrl+V in Chromium. When something is copied inside the remote browser, the panel offers it, and **Copy to this device** writes it to the local clipboard only on that click. Nothing reads the local clipboard on its own, and nothing writes to it without a click.

The panel keeps text in page memory only and shows remote text as soon as the owner opens it. It clears after a send, on **Clear**, on disconnect and when the session ends. Send works only while the viewer is connected, and typing in the panel never reaches the remote browser, even when the page reconnects or a phone keyboard resizes it. x11vnc syncs only the CLIPBOARD selection, so selecting text in the remote browser sends nothing. The panel never calls the browser's clipboard read API, so neither engine shows a permission prompt. Clipboard text never appears in state records, diagnostics, command output, logs or retained test evidence. The installed x11vnc carries only Latin-1 text, so the panel refuses other characters with a message instead of letting them turn into `?`.

When control passes from the human to the agent, the handoff closes Chromium, stops the session's x11vnc as the last X client so the X server resets, then starts a new x11vnc before the agent's browser. The reset empties every selection and the root window's cut buffer, so a credential pasted during human sign-in is not left for the agent. The viewer retries the connection a few times after any drop. If the x11vnc restart fails, the session stays in `handoff-failed` and a retry starts x11vnc again.

Excluded: file transfer, images and rich text, automatic clipboard sync, service shares (they have no viewer), and changes to auth-refresh.

Validation is planned, not yet run: unit tests for the viewer page and x11vnc arguments, a real noVNC round trip on Chromium and Firefox without a pre-granted clipboard permission, a handoff-clearing test that checks the cut buffer, and a privacy sweep with synthetic sentinels. The owner answered the four design questions and the six questions raised by review R-1 on 2026-11-09, each with the recommended option. R-1 found a blocking gap that this revision addresses; a new review is pending. Acceptance authorizes implementation on a feature branch; publication, merge and release stay separate approvals.

### Background

- The viewer page is a custom inline page that creates a noVNC `RFB` object and handles only `connect`, `disconnect` and `securityfailure` events. It never listens for `clipboard` or calls `clipboardPasteFrom`, and it calls `remote.focus()` on `connect` and on every window `resize` (`plugins/remote-gui/internal/proxy/viewer.go:10`). The viewer serves only `/`, `/vnc.html`, `/__remote_gui/viewer-access`, `/websockify` and asset prefixes, and viewer-access returns only the VNC password (`plugins/remote-gui/internal/proxy/viewer.go:16-39`).
- The installed noVNC is 1.5.0 (`$REMOTE_GUI_NOVNC/package.json`, `"version": "1.5.0"`). Its `RFB.clipboardPasteFrom(text)` sends text to the server, returning silently when the connection is not `connected` (`core/rfb.js:496-497`), and its `_handleServerCutText` dispatches a `clipboard` event with the server's text (`core/rfb.js:2204-2224`). Without the extended clipboard extension it replaces every code point above U+00FF with `?` (`core/rfb.js:520-523`). Its keyboard handler is bound to the canvas (`core/rfb.js:261`). noVNC's full `app/ui.js` has its own clipboard panel (`app/ui.js:335-339`), but remote-gui does not serve that page.
- x11vnc starts with `-display`, `-localhost`, `-rfbport`, `-rfbauth`, `-forever`, `-shared`, `-noxdamage` and `-quiet`, and no selection flags (`plugins/remote-gui/internal/browser/browser.go:374`). x11vnc 0.9.17 therefore uses its defaults: it polls PRIMARY and CLIPBOARD and sends changes to viewers, and sets both on text from viewers. Its help lists `-noprimary`, `-nosetprimary`, `-noclipboard`, `-nosetclipboard` and `-nosel` to change that (`x11vnc -help`, lines 3248-3259 of the output).
- The installed x11vnc does not use the extended clipboard. The linked libvncserver 0.9.15 contains the ExtendedClipboard messages (`strings /lib64/libvncserver.so.0.9.15`), but the x11vnc binary has no UTF-8 cut-text symbol (`strings $REMOTE_GUI_X11VNC | grep -i utf8` printed nothing). Review R-1 (finding F-03) advertised the ExtendedClipboard pseudo-encoding to a scratch x11vnc 0.9.17 and observed no capability reply and no "Enabling ExtendedClipboard" log line.
- Text sent from a viewer also lands in the root window's `CUT_BUFFER0`, which survives the x11vnc process while another X client stays connected. It disappeared only when x11vnc was the last X client and Xvfb reset (review R-1, finding F-02). Xvfb starts without `-noreset` (`plugins/remote-gui/internal/browser/browser.go:338`).
- Child processes run with stdout and stderr discarded (`plugins/remote-gui/internal/browser/browser.go:146-147`), and x11vnc runs with `-quiet`.
- A human-to-agent handoff closes Chromium through the owned x11vnc connection and the native Exit menu, then relaunches only Chromium. Xvfb, x11vnc and websockify keep running (`plugins/remote-gui/internal/browser/quit.go:19-29`, `plugins/remote-gui/internal/browser/phase.go:95-152`). Chromium arguments are validated for human mode, but x11vnc arguments are not (`plugins/remote-gui/internal/browser/phase.go:42-59`).
- `spawn` appends each new child to the runtime's children and the record's owned processes (`plugins/remote-gui/internal/browser/browser.go:158-163`). `healthy()` fails when any owned child other than a not-yet-ready browser is dead (`plugins/remote-gui/internal/browser/phase.go:71-86`), and the supervisor fails a transition whose result is not healthy (`plugins/remote-gui/internal/session/handoff.go:100`). A supervisor tick that sees a dead owned child reports `upstream-ownership-changed` and moves the session to `stopping` (`plugins/remote-gui/internal/session/daemon.go:375-381`, `:624-625`).
- Stop terminates every owned child and deletes the profile, downloads, X authority and VNC password file (`plugins/remote-gui/internal/browser/browser.go:219-260`). The X server's selections end with it.
- The real-browser test reads page values through CDP after handing back to agent mode (`tests/remote-gui/browser.e2e.test.ts:74-77`) and types the marker printed by the CLI (`tests/remote-gui/browser.e2e.test.ts:176`). The marker page reports only booleans (`plugins/remote-gui/internal/browser/phase.go:199-209`).
- Chromium requires a secure context and either transient activation or the clipboard-write permission for `navigator.clipboard.writeText`; Firefox requires transient activation. Reading with `readText` triggers a permission request in Chromium and a paste context menu in Firefox [S1], [S2], [S3]. Tailscale HTTPS viewers and `127.0.0.1` loopback viewers are secure contexts [S4].

## Scope

In scope:

- A clipboard panel on the browser-handoff viewer page, in human and agent modes, for Tailscale and loopback transports.
- Sending owner-pasted text to the remote clipboard, and copying the latest remote clipboard text to the owner's device on an explicit click.
- x11vnc selection flags that limit sync to CLIPBOARD.
- Clearing rules for the panel, page memory and the remote clipboard and cut buffer on human-to-agent handoff.
- Bounded automatic reconnect of the viewer after a dropped connection.
- Refusing text that would not arrive intact.
- README and skill updates describing the controls and their privacy behavior.

Out of scope:

- File transfer, images, rich text or HTML clipboard formats.
- Automatic or background clipboard sync in either direction, and any use of `navigator.clipboard.readText`.
- Characters above U+00FF, which the installed x11vnc cannot carry.
- Service shares, which have no viewer.
- Agent access to the owner's local clipboard. The agent keeps only the access it already has through CDP in agent mode.
- Persisting clipboard text in `localStorage`, `sessionStorage`, IndexedDB, cookies, state records or logs.
- Changes to auth-refresh, Tailscale configuration or the session lifecycle beyond the x11vnc restart during human-to-agent handoff.

## Design

### Viewer panel

`plugins/remote-gui/internal/proxy/viewer.go` gains a collapsed clipboard panel in the header beside the status line. It contains:

- A plain `textarea` labelled **Text for the remote browser**. The owner pastes into it with the device's normal paste gesture, which uses no clipboard API and shows no prompt. **Send to remote browser** is enabled only while the RFB connection is connected. On a click the page checks the connection again and the characters (below), calls `RFB.clipboardPasteFrom(text)`, then clears the field and shows a short confirmation that says to press Ctrl+V in the remote page. If either check fails, the field keeps its text and the page shows why.
- A read-only area labelled **Copied in the remote browser**. The page keeps the latest `clipboard` event's text in one variable. When the owner opens the panel, the area shows a character count and the text, unmasked. **Copy to this device** calls `navigator.clipboard.writeText` inside that click handler. If the promise rejects, the page selects the text and asks the owner to copy it with their device's shortcut.
- **Clear**, which empties both areas and the in-memory value and, while connected, sends an empty string with `clipboardPasteFrom` so the remote clipboard is empty too.

While focus is inside the panel, the `connect` and `resize` handlers do not call `remote.focus()`, so typing and pasting there are never sent as remote keystrokes, including after a reconnect or when a phone keyboard resizes the viewport. Closing the panel returns focus to the canvas with `remote.focus()`. Controls have accessible labels and keyboard access.

The page never stores clipboard text outside page memory. It drops the in-memory value on `disconnect`, on `pagehide` and when the session expires. The viewer-access fetch, WebSocket URL and RFB credentials are unchanged.

### Reconnect

After any `disconnect` that follows a successful connection, the page shows a neutral "Reconnecting to shared browser" status and retries up to five times with backoff from one to eight seconds, fetching viewer-access again each time. A successful attempt restores the "connected" status. When the retries run out, or viewer-access fails, the page shows the existing "Shared browser unavailable. Reopen the session link." message. The page does not try to tell a handoff from a stop, an expiry or a network drop.

### Intact text only

Before sending, the page checks every code point. If any is above U+00FF, it refuses the send and names the characters the remote browser cannot receive. It never sends text that noVNC would turn into `?`. The check is unconditional because the installed x11vnc does not negotiate the extended clipboard and detecting it would need a private noVNC field. The README states the limit. Text received from the remote side is shown as received.

### x11vnc selection flags

`plugins/remote-gui/internal/browser/browser.go` adds `-noprimary` and `-nosetprimary` to the x11vnc arguments. Middle-click paste of viewer text in the remote browser therefore stops working, which the owner accepted. Selecting text in the remote browser then sends nothing, and only an explicit copy reaches the viewer. Text from the viewer sets only CLIPBOARD. A unit test asserts the exact argument list.

### Clearing on human-to-agent handoff

The human-to-agent handoff in `plugins/remote-gui/internal/browser/phase.go` runs in this order:

1. Close Chromium through the owned x11vnc connection, as today, and wait for it to exit.
2. Stop the session's owned x11vnc process, verified by its recorded identity, and wait for it to exit. It is then the last X client, so Xvfb resets and drops every selection and the root window's `CUT_BUFFER0`.
3. Start a replacement x11vnc on the same display, port and password file. The replacement takes the old `vnc` entry's place in the runtime's children and in the record's owned processes, so `healthy()` and the supervisor see exactly one live `vnc` child.
4. Launch Chromium in agent mode as today.

The agent-to-human direction does not restart x11vnc.

If step 2 or 3 fails, the handoff fails and the record moves to `handoff-failed` with a diagnostic that names x11vnc. Chromium is not launched in agent mode. While the record is `handoff-failed` after an x11vnc failure, the runtime marks the `vnc` child as absent, like the browser before it is ready, so `healthy()` and the supervisor tick treat it as a recoverable gap and do not stop the session. A retried handoff starts x11vnc before launching Chromium. The viewer cannot connect until that retry succeeds. Stop and expiry clean up as today.

### Privacy

- No Go code reads, logs or stores clipboard text. Clipboard bytes travel only inside the existing authenticated WebSocket between the viewer and x11vnc, through the proxy, which copies frames without inspecting them.
- Command output, state records, diagnostics and supervisor logs contain no clipboard text. The privacy test in AC-05 checks this with synthetic sentinel strings that differ from the session marker.
- Tests and acceptance runs use synthetic sentinels only. Browser verification keeps recordings, tracing, screenshots of the panel contents, HAR and input logging disabled, following the existing skill rule.
- The skill tells agents never to ask the owner to paste a password through the panel in agent mode, and that the panel is for text the owner chooses to share.

### Compatibility

Existing sessions keep the viewer and x11vnc arguments their supervisor started with. Service shares, owner identity, loopback native-code access, the agent-to-human handoff and cleanup are otherwise unchanged. No new dependency is added; noVNC's existing `core/rfb.js` provides both directions.

### Glossary

| Term | Meaning |
| --- | --- |
| Clipboard panel | The viewer's collapsible area with the send field, the remote text area and their buttons. |
| Send to remote browser | The button that makes the field's text the remote CLIPBOARD selection. |
| Copy to this device | The button that writes the latest remote clipboard text to the owner's local clipboard. |
| Remote clipboard | The CLIPBOARD selection and the root window's cut buffer on the session's X display. |

## Acceptance Criteria

- [ ] AC-01: In a fresh Chromium viewer and a fresh Firefox viewer, the owner can paste text into the panel, send it, and paste it into a page in the remote browser with Ctrl+V, in both human and agent modes.
- [ ] AC-02: Text copied inside the remote browser appears in the open panel, and **Copy to this device** places it on the viewer device's clipboard in Chromium and Firefox. Selecting text without copying sends nothing to the viewer.
- [ ] AC-03: The viewer never reads the local clipboard without the owner's paste gesture, never writes it without a click on **Copy to this device**, and keeps clipboard text only in page memory, which is empty after a send, **Clear**, disconnect and session stop.
- [ ] AC-04: Text containing a character above U+00FF is refused with a message naming it, and is never delivered altered to the remote clipboard.
- [ ] AC-05: Synthetic clipboard sentinels sent in both directions appear in no command output, state record, diagnostic, supervisor or child log, test artifact or retained evidence file.
- [ ] AC-06: After a human-to-agent handoff, the remote CLIPBOARD selection and the root window's `CUT_BUFFER0` are empty and the viewer reconnects on its own with the same URL and expiry. A failed x11vnc restart leaves a `handoff-failed` record without an agent-mode browser that survives supervisor health ticks, and a retried handoff then succeeds.
- [ ] AC-07: Existing service shares, owner-restricted access, loopback native-code access, browser phases, legacy records and private cleanup keep their supported behavior, and the module's race tests, vet, pinned lint and tidy checks pass.
- [ ] AC-08: The README and skill describe the panel with the glossary terms, the privacy and clearing rules, the browser permission behavior and the character limit, and contain no claim that the clipboard syncs automatically.
- [ ] AC-09: Typing or pasting in the panel never reaches the remote browser, including across reconnects and viewport resizes, and **Send to remote browser** neither clears the field nor confirms a send while the viewer is disconnected.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Extend the real noVNC browser fixture (`REMOTE_GUI_BROWSER_E2E=1`) and `tests/remote-gui/browser.e2e.test.ts`: in fresh Chromium and Firefox contexts, fill the panel field with a synthetic sentinel that differs from the marker, send, focus a remote page input and press Ctrl+V. In agent mode read the input value through CDP. In human mode, paste, hand off to agent, then read the same input through CDP. |
| AC-02 | Same fixture: copy a sentinel inside the remote page, assert it appears in the opened panel, click **Copy to this device** in Chromium without granting clipboard-write and in Firefox, so both rely on the click, and assert the local clipboard value. Select text without copying and assert the panel value is unchanged. Unit-test the x11vnc argument list for `-noprimary` and `-nosetprimary`. |
| AC-03 | Viewer page tests with a stubbed `navigator.clipboard` that records calls: assert no `readText` call ever and `writeText` only inside the click handler. Assert empty page state after send, **Clear**, a simulated disconnect and stop, and assert storage APIs hold no sentinel. The AC-02 real-browser run without a clipboard-write grant also fails if a write happens outside the click. |
| AC-04 | Viewer page test: sending text with a code point above U+00FF shows the refusal naming it and calls no send. Real fixture: attempt a sentinel containing `€` and assert the refusal appears and the remote clipboard is unchanged, never holding a `?` substitution. |
| AC-05 | Run the AC-01 and AC-02 fixtures with unique sentinels that differ from the marker, then search command output, the session directory, state records, diagnostics, supervisor logs and all test artifacts for each sentinel; any match fails. |
| AC-06 | Real fixture: send a sentinel from the viewer and copy another in the remote page in human mode, hand off to agent, paste into an agent-mode page input and read it through CDP, and read the root window's `CUT_BUFFER0` with `xprop` on the session display; assert both are empty. Assert the viewer reconnects and URL and expiry are unchanged. Inject an x11vnc restart failure, assert `handoff-failed` and no agent-mode browser after at least one supervisor health tick, then retry the handoff and assert ready agent mode and a working viewer. |
| AC-07 | Run `go test -race ./...`, `go vet ./...`, golangci-lint v2.15.0 `config verify` and `run`, and `go mod tidy -diff` in `plugins/remote-gui`, plus the existing service, origin-auth and native-routing fixtures in `tests/remote-gui`. |
| AC-08 | Review the README and skill diff against the glossary and design; `bun test tests/vh-adlc` and the package test in `tests/remote-gui/package.test.ts` pass; grep both files for automatic-sync wording. |
| AC-09 | Viewer page tests: with focus in the panel, fire `connect` and `resize` and assert focus stays in the panel and no key event reaches the RFB stub; with the connection disconnected, assert **Send to remote browser** is disabled and a forced click keeps the field text without calling `clipboardPasteFrom`. Real fixture: type in the panel during a reconnect and assert the remote page input is unchanged. |

## Tasks

None yet; written once the document is planned.

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-09 | R-1 | spec | `8ff685a1883330fd0d50536c79788eae4cc0399f` | claude-opus-5-5 | procedural | Blocking x11vnc replacement health gap plus seven should-fix and nit findings. |
| 2026-11-09 | R-2 | spec | `4891dcc7d97e9c725fbef93c83a7413f59321aa8` | claude-opus-5-5 | procedural | Blocking: the installed x11vnc moves no clipboard text in either direction; six should-fix findings. |

### R-1

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design, Clearing on human-to-agent handoff
EVIDENCE: The design records the replacement x11vnc "with the existing `spawn` path", which appends to r.children and record.Owned (plugins/remote-gui/internal/browser/browser.go:158-163). It says nothing about removing the old vnc entry. runtime.healthy() returns false when any owned child other than the browser is dead (plugins/remote-gui/internal/browser/phase.go:71-86), and browserControl.handoff fails a transition whose result is not healthy (plugins/remote-gui/internal/session/handoff.go:100, "browser-handoff-result-unverified"). Implemented as written, every human-to-agent handoff would fail. For a failed restart, the supervisor tick returns "upstream-ownership-changed" once alive() is false (plugins/remote-gui/internal/session/daemon.go:624-625), and supervise() then sets the state to "stopping" and overwrites the diagnostic (daemon.go:375-381). That contradicts AC-06's "leaves a `handoff-failed` record" and the design's "stop and expiry clean up as today".
PROPOSAL: State that the replacement takes the old vnc entry's place in r.children and record.Owned. Define how health and a retry from `handoff-failed` behave when the restart fails: whether the session survives without x11vnc, and whether the retry starts x11vnc again. Make the AC-06 proof assert that the record is still `handoff-failed` after at least one supervisor health tick.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design, Clearing on human-to-agent handoff; Context, Owner summary
EVIDENCE: I ran a scratch Xvfb :2711 with x11vnc 0.9.17 started with `-noprimary -nosetprimary`, sent ClientCutText "SENTINEL-two" from a raw RFB client, then killed x11vnc while one other X client (`xprop -root -spy`) stayed connected. Before the kill, `xprop -root CUT_BUFFER0` printed `CUT_BUFFER0(STRING) = "SENTINEL-two"`, and it printed the same after the kill. The property was cleared in my run only when x11vnc was the last X client and Xvfb reset (Xvfb starts without -noreset, browser.go:338). The design says clearing works because "X selections owned by the old x11vnc and the old Chromium end with those processes", and the summary says a pasted credential "is therefore not left for the agent". Viewer text also lands in the root window's CUT_BUFFER0, which does not end with x11vnc.
PROPOSAL: Name CUT_BUFFER0 in the design. Either clear it explicitly during the handoff, or state that clearing depends on the Xvfb reset and require Chromium and all its X clients to exit before x11vnc stops. Extend the AC-06 proof to assert that CUT_BUFFER0 is absent on the root window after handoff.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Context, Background; Design, Intact text only
EVIDENCE: Background ("is measured in T1") and Design ("T1 measures whether x11vnc 0.9.17 ... negotiates the extension") both rely on a task T1, but Tasks says "None yet; written once the document is planned." I measured it in this review against a scratch x11vnc 0.9.17 linked to /lib64/libvncserver.so.1 -> libvncserver.so.0.9.15. After SetEncodings advertised the ExtendedClipboard pseudo-encoding (-1063131698, 0xC0A1E5CE), the server sent 0 bytes, and its log has "Using raw encoding for client 127.0.0.1" but no "Enabling ExtendedClipboard extension" line. Detecting the extension would also need the private field `_clipboardServerCapabilitiesFormats` (core/rfb.js:155, 499).
PROPOSAL: Settle the design now: apply the Latin-1 check unconditionally, have the README state the limit, and drop the conditional branch. Alternatively, point to a Test Plan row instead of a task that does not exist.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Viewer panel
EVIDENCE: The existing page calls `remote.focus()` in the `connect` handler and in `window.addEventListener('resize',()=>remote.focus())` (plugins/remote-gui/internal/proxy/viewer.go:10). noVNC binds its Keyboard to the canvas (`new Keyboard(this._canvas)`, core/rfb.js:261). On a phone, focusing the textarea opens the soft keyboard and resizes the viewport. The planned reconnect after handoff fires `connect`. Either one moves focus to the canvas, so text the owner meant for the panel goes to the remote browser as keystrokes, possibly the agent-mode browser. The design only says "Keyboard focus inside the panel stays out of the RFB canvas".
PROPOSAL: State that the resize and connect handlers do not refocus the canvas while focus is inside the panel. Add a viewer page test that checks this.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Clearing on human-to-agent handoff
EVIDENCE: "The viewer page reconnects automatically after a disconnect that happens during a handoff ... The status line says the browser is switching." The page has no handoff signal: /__remote_gui/viewer-access returns only the password (viewer.go:21-28), and the RFB `disconnect` event does not say why the connection closed. The page cannot tell a handoff from a stop, an expiry or a network drop, so this behavior and AC-06's "reconnects on its own" are not defined in a form an implementer can build.
PROPOSAL: Define the trigger. One option is a bounded retry with backoff after any disconnect that follows a successful connection, with a neutral status message. Another is an owner-authenticated state endpoint the page can query. State what the page shows when the retries run out.

FINDING: F-06
KIND: factual
SEVERITY: should-fix
WHERE: Design, Viewer panel
EVIDENCE: `clipboardPasteFrom` returns silently when `this._rfbConnectionState !== 'connected' || this._viewOnly` (noVNC 1.5.0 core/rfb.js:497). The design has **Send to remote browser** call it, "then clears the field and shows a short confirmation". During the reconnect window after a handoff, or after any disconnect, the text is dropped while the page confirms the send and clears the field.
PROPOSAL: Disable **Send to remote browser** unless the RFB connection is connected, and clear the field or confirm only after that check passes. Cover it with a viewer page test.

FINDING: F-07
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan, AC-01 and AC-05
EVIDENCE: The AC-01 proof asserts the pasted value "through the marker page, once per mode". The marker page reports only booleans, and sets `input_verified` only when the input equals the marker (plugins/remote-gui/internal/browser/phase.go:199, 209, 248-249). Human mode has no CDP. To prove the paste in human mode, the sentinel would have to be the marker. The CLI prints the marker (the existing test types `session.marker` taken from CLI output, tests/remote-gui/browser.e2e.test.ts:176), so the AC-05 sweep of command output would match it. Making the marker page report text instead would break its "only probe booleans" rule.
PROPOSAL: Say how the human-mode paste is observed without the marker string and without the marker page reporting text. One way is to read the value through CDP after handing back to agent mode, as the existing test does at browser.e2e.test.ts:74-77. Require sentinels to differ from the marker.

FINDING: F-08
KIND: judgement
SEVERITY: nit
WHERE: Test Plan, AC-02 and AC-03
EVIDENCE: The AC-02 proof grants clipboard-write in Chromium before clicking **Copy to this device**. With that permission, `writeText` succeeds without transient activation, so the real-browser run cannot detect a write made outside the click handler. That part of AC-03 then rests only on the stubbed unit test.
PROPOSAL: Run the Chromium case without granting clipboard-write so that it uses transient activation as an owner would, or add a real-browser check that no write happens without a click.

### R-2

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Context, Owner summary and Background; Design, x11vnc selection flags; Acceptance Criteria, AC-01 and AC-02
EVIDENCE: The summary says "noVNC library and x11vnc already exchange clipboard text", and Background says x11vnc 0.9.17 "polls PRIMARY and CLIPBOARD and sends changes to viewers, and sets both on text from viewers". The only cited source for that is the `x11vnc -help` text. I tested it on a scratch display. I ran Xvfb :2794, a scratch Chromium on a page that logs paste and copy events into document.title (read through /json/list), and $REMOTE_GUI_X11VNC 0.9.17 with the design's flags (`-noprimary -nosetprimary -debug_sel`). A raw RFB client set raw encoding, kept requesting framebuffer updates and parsed every server message. (1) Remote to viewer: I typed "freshcopy" in the page and pressed Ctrl+A, Ctrl+C. Chromium logged `copy`, XGetSelectionOwner showed CLIPBOARD owned by Chromium (0xc00000), and in 3 s the client got no ServerCutText ("cut texts from server: []"). The x11vnc log had no selection line at all. (2) Viewer to remote: the client sent ClientCutText "SENT-fresh". The x11vnc log shows `xcut_receive: 'SENT-fresh'` and `Set CLIPBOARD 'SENT-fresh'`, but CLIPBOARD stayed owned by Chromium, and Ctrl+V in the page logged `paste:freshcopy`. In an earlier run nothing owned CLIPBOARD (owner 0x0) and only CUT_BUFFER0 held the viewer text. Ctrl+V then logged an empty `paste:`, so Chromium does not fall back to the cut buffer. With x11vnc's default flags (no -noprimary or -nosetprimary) the outcome was the same: no Set PRIMARY line, no owner change, an empty paste and no ServerCutText. The installed x11vnc moves clipboard text in neither direction. Every box can be ticked in the design and AC-01 and AC-02 still fail.
PROPOSAL: Replace the x11vnc premise with observed behavior. Settle in the design how text actually reaches the CLIPBOARD selection and comes back from it, for example a different VNC server build, x11vnc options that are proven to work, or an owned helper X client that owns and reads CLIPBOARD. Add a Context citation for a working round trip measured on this host before acceptance.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Design, Viewer panel (Clear); Design, Glossary
EVIDENCE: Design: "Clear ... sends an empty string with clipboardPasteFrom so the remote clipboard is empty too." The glossary defines Remote clipboard as "The CLIPBOARD selection and the root window's cut buffer". On scratch Xvfb :2793 with x11vnc 0.9.17 `-noprimary -nosetprimary`, a raw RFB client sent ClientCutText "SENT-clear", and `xprop -root CUT_BUFFER0` printed `CUT_BUFFER0(STRING) = "SENT-clear"`. A zero-length ClientCutText followed, and xprop still printed `CUT_BUFFER0(STRING) = "SENT-clear"`. No criterion or Test Plan row checks the remote side of Clear.
PROPOSAL: Either drop the claim that Clear empties the remote clipboard, or define a mechanism that is proven to empty both CLIPBOARD and CUT_BUFFER0. Then add the remote effect to AC-03 and to its proof.

FINDING: F-03
KIND: factual
SEVERITY: should-fix
WHERE: Context, Background; Test Plan, AC-01
EVIDENCE: Background: "The real-browser test reads page values through CDP after handing back to agent mode (tests/remote-gui/browser.e2e.test.ts:74-77)." Those lines attach CDP to a session that was started in agent mode (`cli('start','--ttl','2m')`, line 50) and read an input typed through the viewer. No handoff happens there. The only handoff test (lines 192-207) shows that sessionStorage survives the Chromium restart. It also shows that in-memory page state does not survive: `waitFor(() => memoryProofs.includes(false), 'in-memory-only fixture was incorrectly reported as retained')`. The AC-01 human-mode proof ("paste, hand off to agent, then read the same input through CDP") assumes that a typed input value survives the human-to-agent Chromium restart. No cited evidence shows that.
PROPOSAL: Correct the citation. Make the human-mode proof observe the paste through something the existing test shows survives the handoff, for example a test fixture page that stores the pasted sentinel in sessionStorage. Alternatively, add a check that form values survive the restart.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan, AC-06
EVIDENCE: The AC-06 proof checks CLIPBOARD by "paste into an agent-mode page input and read it through CDP ... assert both are empty". An empty input also results when a paste carries nothing for any other reason. Per F-01, viewer text never becomes the CLIPBOARD selection on this host, so this assertion would pass even if clearing did nothing. The proof has no positive control showing the sentinels were in CLIPBOARD and CUT_BUFFER0 before the handoff.
PROPOSAL: Before the handoff, assert with an X client on the session display that the sentinel is in CUT_BUFFER0 and that CLIPBOARD returns it. After the handoff, assert that CUT_BUFFER0 is absent and that CLIPBOARD has no owner or returns no sentinel. Do not infer emptiness from an empty paste.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Clearing on human-to-agent handoff
EVIDENCE: Step 1 waits for Chromium to exit, which in code is the tracked main process (`r.chrome.done`, plugins/remote-gui/internal/browser/phase.go:130-137). Step 2 then asserts "It is then the last X client, so Xvfb resets". I ran a scratch Chromium on Xvfb :2793 with `--disable-gpu --ozone-platform=x11`. `ss -xpn` showed four X connections: two held by the main process, and two held by child pid 2748886 (`--type=gpu-process`) and its broker. The GPU process is not a tracked child. If any X client outlives the main process, or a new one connects before Xvfb processes the old x11vnc's close, no reset happens and CUT_BUFFER0 stays. Review R-1 showed that, and nothing in the design detects it. (Six back-to-back x11vnc stop-and-start runs on an idle scratch display did reset each time, so this is a missing check, not an observed failure.)
PROPOSAL: Before the agent-mode browser launches, have the handoff verify that the reset happened, for example by confirming that CUT_BUFFER0 is absent and that PRIMARY and CLIPBOARD have no owner. If they are not, fail into `handoff-failed` with an x11vnc or clipboard diagnostic.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan, AC-02 and AC-03
EVIDENCE: The AC-02 proof says "click Copy to this device in Chromium without granting clipboard-write and in Firefox ... and assert the local clipboard value", but it does not say how the test reads the local clipboard. The document's own Background (line 43, [S3]) says that `readText` requests a permission in Chromium and shows a paste context menu in Firefox. So reading the value back either needs a grant that can also authorize writes without a click, which undoes the R-1 F-08 fix and the AC-03 real-browser check, or it has no stated mechanism in Firefox.
PROPOSAL: Name the read-back method for each engine and show that it does not grant a write permission before the click, for example a native paste into a separate local test field after the click. Otherwise state that the check is a manual procedure.

FINDING: F-07
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Intact text only; Acceptance Criteria, AC-04
EVIDENCE: Design: "Text received from the remote side is shown as received." noVNC decodes standard ServerCutText as one byte per character (`rQshiftStr`, core/rfb.js:2217-2218), and the installed x11vnc has no extended clipboard (Background). Remote text with characters above U+00FF therefore reaches the panel replaced or garbled, and **Copy to this device** copies it with no warning. A copied credential could arrive altered. AC-04 covers only the send direction.
PROPOSAL: Define what the panel does with remote text that may have been altered, for example a warning beside the copy button when the received text contains `?` or bytes outside printable Latin-1. Alternatively, raise the choice as an open question, and cover the chosen behavior in AC-04.

## Sources

- [S1] [Clipboard: writeText() method, MDN](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText): writing requires a secure context.
- [S2] [Clipboard: readText() method, MDN](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/readText): reading requires a secure context.
- [S3] [Clipboard API, security considerations, MDN](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API#security_considerations): Chromium writes need the clipboard-write permission or transient activation and reads request clipboard-read; Firefox writes need transient activation and reads show a paste context menu. The page does not state a permission rule for native paste into a text field; the design treats that as the browser's ordinary paste behavior and the real-browser tests confirm it.
- [S4] [Secure contexts, MDN](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts): 127.0.0.0/8, `::1` and `localhost` are potentially trustworthy origins.
