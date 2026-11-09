---
status: draft
status_description: "Redesigned around a built-in X clipboard helper after review R-2; waits for a new spec review and acceptance."
issue: https://github.com/michielvha/vh-adlc/issues/61
goal: "The owner can move text between their own device and the shared remote browser through explicit viewer controls, and the text never reaches logs, records or retained evidence."
covers:
  - plugins/remote-gui/
  - tests/remote-gui/
---

# Plan: Clipboard controls for the remote-gui viewer

Add an owner-initiated clipboard panel to the shared-browser viewer, backed by a built-in X clipboard helper, so the owner can send text into the remote browser and copy text back out without automatic clipboard access on either side.

## Context

### Owner summary

Typing a long URL or token into the shared browser today means retyping it through the canvas. The viewer has no clipboard controls. The installed x11vnc does not move clipboard text in either direction between a viewer and Chromium, so the VNC connection cannot carry it.

This feature adds a small clipboard panel to the viewer page and a built-in clipboard helper in the session supervisor. The helper is a minimal X client written in plain Go, with no new host tool or module. It sets and reads the remote browser's CLIPBOARD selection. The panel talks to it over the viewer's existing owner-authenticated connection.

The owner pastes text into a field on their own device and presses **Send to remote browser**; the text becomes the remote clipboard, ready for Ctrl+V in Chromium. Opening the panel, or pressing **Refresh**, fetches what was last copied in the remote browser, and **Copy to this device** writes it to the local clipboard only on that click. Nothing reads the local clipboard on its own, and nothing writes to it without a click. Full Unicode works in both directions, up to 64 KiB.

Text stays in page memory and in the helper's memory only. The panel clears after a send, on **Clear**, on disconnect and when the session ends; **Clear** also empties the remote clipboard. Typing in the panel never reaches the remote browser. When control passes from the human to the agent, the handoff clears the remote clipboard and checks that it is empty before the agent's browser starts, so a credential pasted during human sign-in is not left for the agent. Clipboard text never appears in state records, diagnostics, command output, logs or retained test evidence.

Excluded: file transfer, images and rich text, automatic clipboard sync, the PRIMARY selection, service shares, and changes to auth-refresh.

A prototype of the helper passed a full round trip on this host, recorded in Background. The feature's own checks are planned, not run: viewer page and helper unit tests, a real round trip on Chromium and Firefox viewers, a handoff test with before and after checks, and a privacy sweep. The owner's decisions are listed under Design. Reviews R-1 and R-2 found blocking gaps that this revision replaces; a new review is pending. Acceptance authorizes implementation on a feature branch; publication, merge and release stay separate approvals.

### Background

- The viewer page is a custom inline page that creates a noVNC `RFB` object and handles only `connect`, `disconnect` and `securityfailure` events. It calls `remote.focus()` on `connect` and on every window `resize` (`plugins/remote-gui/internal/proxy/viewer.go:10`). The viewer serves only `/`, `/vnc.html`, `/__remote_gui/viewer-access`, `/websockify` and asset prefixes, and viewer-access returns only the VNC password (`plugins/remote-gui/internal/proxy/viewer.go:16-39`). noVNC binds its keyboard handler to the canvas (`$REMOTE_GUI_NOVNC/core/rfb.js:261`).
- The installed x11vnc 0.9.17 moves no clipboard text between a viewer and Chromium. Review R-2 (finding F-01) measured on a scratch display that text copied in Chromium produced no ServerCutText, and that ClientCutText was logged as set but never became the CLIPBOARD selection Chromium pastes from, with and without `-noprimary -nosetprimary`. Viewer text did land in the root window's `CUT_BUFFER0`, which Chromium does not read (R-1 F-02, R-2 F-01 and F-02).
- x11vnc starts with no selection flags (`plugins/remote-gui/internal/browser/browser.go:374`). Its help lists `-nosel`, which stops it managing selections and cut buffers at all (`x11vnc -help`, line 3248 of the output).
- A prototype X client proved the helper approach on this host on 2026-11-09. It is 513 lines of Go with no module requirements and a hand-written X11 protocol, authenticating with a MIT-MAGIC-COOKIE-1 Xauthority file over the display's Unix socket, as remote-gui starts Xvfb (`plugins/remote-gui/internal/browser/browser.go:335-338`). On a scratch Xvfb with a scratch Chromium 151, its run log recorded:
  - owning CLIPBOARD with `Zürich € ✓ sentinel-A`, then pasting in Chromium: `textarea="Zürich € ✓ sentinel-A" ... -> PASS`;
  - reading after Chromium copied `sentinel-B ✓ ü`: `text="sentinel-B ✓ ü"`, received as `UTF8_STRING`;
  - after clearing: `CLIPBOARD has no owner`, an empty paste, and `CUT_BUFFER0: not found` (also after first setting it to `stale-cut`);
  - retaking ownership afterwards: PASS.
  Chromium sent about 13 `TARGETS` requests and one `UTF8_STRING` request per paste, so the helper must answer `TARGETS`. No INCR transfer occurred. Pastes driven by CDP editing commands worked; Ctrl+V and Ctrl+C sent as CDP key events did nothing. A wrong cookie was refused by the server.
- A human-to-agent handoff closes Chromium through the owned x11vnc connection and relaunches only Chromium; Xvfb, x11vnc and websockify keep running, so the viewer connection stays up (`plugins/remote-gui/internal/browser/quit.go:19-29`, `plugins/remote-gui/internal/browser/phase.go:95-152`).
- Child processes run with stdout and stderr discarded (`plugins/remote-gui/internal/browser/browser.go:146-147`). Stop terminates every owned child and deletes the profile, downloads, X authority and VNC password file (`plugins/remote-gui/internal/browser/browser.go:219-260`).
- The real-browser handoff test shows that sessionStorage survives a human-to-agent handoff while in-memory page state does not (`tests/remote-gui/browser.e2e.test.ts:192-207`). The marker page reports only booleans (`plugins/remote-gui/internal/browser/phase.go:199-209`).
- Chromium requires a secure context and either transient activation or the clipboard-write permission for `navigator.clipboard.writeText`; Firefox requires transient activation. Reading with `readText` triggers a permission request in Chromium and a paste context menu in Firefox [S1], [S2], [S3]. Tailscale HTTPS viewers and `127.0.0.1` loopback viewers are secure contexts [S4].

## Scope

In scope:

- A clipboard panel on the browser-handoff viewer page, in human and agent modes, for Tailscale and loopback transports.
- A built-in clipboard helper in the supervisor that sets, reads and clears the CLIPBOARD selection of the session's display.
- Clipboard routes on the viewer origin, behind the existing owner authentication.
- Clearing the remote clipboard on **Clear** and on human-to-agent handoff, with a check that it is empty.
- Turning off x11vnc's own selection handling.
- README and skill updates describing the controls and their privacy behavior.

Out of scope:

- File transfer, images, rich text or HTML clipboard formats.
- Automatic or background clipboard sync in either direction, and any use of `navigator.clipboard.readText`.
- The PRIMARY selection and middle-click paste.
- Text over 64 KiB.
- Service shares, which have no viewer.
- Agent access to the owner's local clipboard. The agent keeps only the access it already has through CDP in agent mode.
- Persisting clipboard text in `localStorage`, `sessionStorage`, IndexedDB, cookies, state records or logs.
- Changes to auth-refresh or Tailscale configuration.

## Design

### Owner decisions

The owner settled these on 2026-11-09:

- Clear the remote clipboard on every human-to-agent handoff.
- Sync only the CLIPBOARD selection.
- A plain paste field, with no button that reads the local clipboard.
- Show remote text as soon as the panel opens.
- Use a built-in X helper instead of x11vnc or a new host tool, after R-2 showed x11vnc moves no text.
- Apply the R-2 test proposals as written: a native paste into a separate local test field to read the local clipboard, positive before and after checks for clearing, and an observable human-mode paste.

Earlier answers about restarting x11vnc, reconnecting after a restart and the Latin-1 limit applied to the x11vnc design and no longer apply: the helper needs no x11vnc restart and carries full Unicode.

### Clipboard helper

A new package `plugins/remote-gui/internal/xclip` implements a minimal X11 client with the standard library only. The browser runtime creates one helper per session after Xvfb is ready, using the session's display socket and Xauthority file. It runs inside the supervisor process, so no new owned process is tracked. It offers three operations:

- **Set(text)**: create an unmapped window, take ownership of CLIPBOARD with a server timestamp from a zero-length PropertyNotify, and answer SelectionRequest events for `TARGETS`, `UTF8_STRING`, `STRING` (Latin-1, with characters outside it replaced) and `TEXT`; refuse other targets. The helper keeps the text in memory only while it owns the selection, and drops it on SelectionClear, Clear or stop.
- **Get()**: convert CLIPBOARD to `UTF8_STRING` on its own window, falling back to `STRING` decoded as Latin-1, and return the text. No owner returns an empty result. An INCR reply or text over 64 KiB returns `clipboard-too-large`.
- **Clear()**: take CLIPBOARD and PRIMARY with a helper window, destroy the window so neither selection has an owner, delete `CUT_BUFFER0` on the root window, and drop any held text. Then verify that CLIPBOARD and PRIMARY have no owner and `CUT_BUFFER0` is absent, and return `clipboard-clear-unverified` if not.

Each operation has a bounded timeout. The helper never logs text, and its errors carry fixed diagnostic codes only.

x11vnc gains `-nosel`, so only the helper touches selections and cut buffers. A unit test asserts the exact x11vnc argument list.

### Clipboard routes

The viewer proxy serves `/__remote_gui/clipboard` for browser sessions, behind the same owner authentication as every other viewer request:

- `POST` with a UTF-8 `text/plain` body up to 64 KiB calls Set. A larger body returns 413 with `clipboard-too-large`.
- `GET` calls Get and returns `{"text": ...}`.
- `DELETE` calls Clear.

All three require an `Origin` header equal to the viewer origin and the header `X-Remote-GUI-Clipboard: 1`, return `Cache-Control: no-store`, and send no CORS headers. Responses and errors contain no text other than the requested clipboard value.

### Viewer panel

`plugins/remote-gui/internal/proxy/viewer.go` gains a collapsed clipboard panel in the header beside the status line. It contains:

- A plain `textarea` labelled **Text for the remote browser**. The owner pastes into it with the device's normal paste gesture, which uses no clipboard API and shows no prompt. **Send to remote browser** posts the text. Only after a successful response does the page clear the field and show a short confirmation that says to press Ctrl+V in the remote page. On failure the field keeps its text and the page shows why.
- A read-only area labelled **Copied in the remote browser**. Opening the panel and pressing **Refresh** fetch the remote clipboard; the area then shows a character count and the text, unmasked. **Copy to this device** calls `navigator.clipboard.writeText` inside that click handler. If the promise rejects, the page selects the text and asks the owner to copy it with their device's shortcut.
- **Clear**, which empties both areas and the in-memory value and sends `DELETE`.

While focus is inside the panel, the `connect` and `resize` handlers do not call `remote.focus()`, so typing and pasting there are never sent as remote keystrokes, including when a phone keyboard resizes the viewport. Closing the panel returns focus to the canvas with `remote.focus()`. Controls have accessible labels and keyboard access.

The page never stores clipboard text outside page memory. It drops the in-memory value on `disconnect`, on `pagehide` and when the session expires. The viewer-access fetch, WebSocket URL and RFB credentials are unchanged.

### Clearing on human-to-agent handoff

The human-to-agent handoff in `plugins/remote-gui/internal/browser/phase.go` calls Clear after Chromium exits and before Chromium launches in agent mode. If Clear returns an error, the handoff fails, the record moves to `handoff-failed` with that diagnostic, and Chromium is not launched in agent mode. A retried handoff runs Clear again. Xvfb, x11vnc and websockify keep running, so the viewer stays connected. The agent-to-human direction does not clear.

### Privacy

- Clipboard text exists only in the viewer page's memory, in request and response bodies on the owner-authenticated connection, and in the helper's memory while it owns the selection. No Go code logs or stores it, and diagnostics use fixed codes.
- Command output, state records, diagnostics and supervisor logs contain no clipboard text. The privacy test in AC-05 checks this with synthetic sentinels that differ from the session marker.
- Tests and acceptance runs use synthetic sentinels only. Browser verification keeps recordings, tracing, screenshots of the panel contents, HAR and input logging disabled, following the existing skill rule.
- The skill tells agents never to ask the owner to paste a password through the panel in agent mode, and that the panel is for text the owner chooses to share.

### Compatibility

Existing sessions keep the viewer, proxy routes and x11vnc arguments their supervisor started with. Service shares, owner identity, loopback native-code access, browser phases and cleanup are otherwise unchanged. No module or host dependency is added.

### Glossary

| Term | Meaning |
| --- | --- |
| Clipboard panel | The viewer's collapsible area with the send field, the remote text area and their buttons. |
| Clipboard helper | The built-in X client in the supervisor that sets, reads and clears the remote clipboard. |
| Send to remote browser | The button that makes the field's text the remote clipboard. |
| Copy to this device | The button that writes the fetched remote clipboard text to the owner's local clipboard. |
| Remote clipboard | The CLIPBOARD selection of the session's X display. |

## Acceptance Criteria

- [ ] AC-01: In a fresh Chromium viewer and a fresh Firefox viewer, the owner can paste text into the panel, send it, and paste it into a page in the remote browser with Ctrl+V, in both human and agent modes.
- [ ] AC-02: Text copied inside the remote browser appears when the owner opens the panel or presses **Refresh**, and **Copy to this device** places it on the viewer device's clipboard in Chromium and Firefox.
- [ ] AC-03: The viewer never reads the local clipboard without the owner's paste gesture, never writes it without a click on **Copy to this device**, and keeps clipboard text only in page memory, which is empty after a send, **Clear**, disconnect and session stop. After **Clear**, the remote clipboard has no owner.
- [ ] AC-04: Text up to 64 KiB, including characters outside Latin-1, arrives unchanged in both directions, and larger text is refused with a message.
- [ ] AC-05: Synthetic clipboard sentinels sent in both directions appear in no command output, state record, diagnostic, supervisor or child log, test artifact or retained evidence file.
- [ ] AC-06: After a human-to-agent handoff, CLIPBOARD and PRIMARY have no owner and `CUT_BUFFER0` is absent on the session display, and the viewer stays connected. A failed clear leaves a `handoff-failed` record without an agent-mode browser, and a retried handoff then succeeds.
- [ ] AC-07: Existing service shares, owner-restricted access, loopback native-code access, browser phases, legacy records and private cleanup keep their supported behavior, and the module's race tests, vet, pinned lint and tidy checks pass.
- [ ] AC-08: The README and skill describe the panel with the glossary terms, the privacy and clearing rules, the browser permission behavior and the size limit, and contain no claim that the clipboard syncs automatically.
- [ ] AC-09: Typing or pasting in the panel never reaches the remote browser, including across reconnects and viewport resizes, and **Send to remote browser** neither clears the field nor confirms a send that did not succeed.
- [ ] AC-10: Clipboard routes refuse requests without the owner's authentication, with a different `Origin`, or without the clipboard header, and return no clipboard text in those refusals.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Extend the real noVNC browser fixture (`REMOTE_GUI_BROWSER_E2E=1`) and `tests/remote-gui/browser.e2e.test.ts`. In fresh Chromium and Firefox viewer contexts, send a sentinel that differs from the marker, focus an input on a test fixture page in the remote browser, and press Ctrl+V through the viewer canvas so the key reaches Chromium as an X event. The fixture page copies each pasted value into sessionStorage. In agent mode read it through CDP; in human mode hand off to agent first, then read sessionStorage through CDP. |
| AC-02 | Same fixture: in agent mode, copy a sentinel on the fixture page with a CDP `copy` editing command; open the panel and assert the text; click **Copy to this device** in Chromium without granting clipboard-write and in Firefox; then paste natively into a separate local test field and assert the value. |
| AC-03 | Viewer page tests with a stubbed `navigator.clipboard` that records calls: no `readText` call ever, and `writeText` only inside the click handler. Assert empty page state after send, **Clear**, a simulated disconnect and stop, and that storage APIs hold no sentinel. Real fixture: after **Clear**, a helper Get returns empty and `xprop` reports no CLIPBOARD owner. |
| AC-04 | Helper unit tests against a scratch Xvfb: Set then a second client's Get round trip `Zürich € ✓` and a 64 KiB string exactly; a 64 KiB plus one byte POST returns 413; `STRING` fallback decodes Latin-1. Real fixture: the AC-01 and AC-02 sentinels include `€` and `✓`. |
| AC-05 | Run the AC-01 and AC-02 fixtures with unique sentinels that differ from the marker, then search command output, the session directory, state records, diagnostics, supervisor logs and all test artifacts for each sentinel; any match fails. |
| AC-06 | Real fixture: in human mode, send a sentinel and assert with a helper Get that CLIPBOARD returns it; set `CUT_BUFFER0` with `xprop` and assert it is present. Hand off to agent; assert no CLIPBOARD or PRIMARY owner and `CUT_BUFFER0` absent, and that the viewer WebSocket stayed open. Inject a Clear failure, assert `handoff-failed` and no agent-mode browser after at least one supervisor health tick, then retry and assert ready agent mode. |
| AC-07 | Run `go test -race ./...`, `go vet ./...`, golangci-lint v2.15.0 `config verify` and `run`, and `go mod tidy -diff` in `plugins/remote-gui`, plus the existing service, origin-auth and native-routing fixtures in `tests/remote-gui`. |
| AC-08 | Review the README and skill diff against the glossary and design; `bun test tests/vh-adlc` and the package test in `tests/remote-gui/package.test.ts` pass; grep both files for automatic-sync wording. |
| AC-09 | Viewer page tests: with focus in the panel, fire `connect` and `resize` and assert focus stays in the panel and no key event reaches the RFB stub; with a failing POST, assert the field keeps its text and no confirmation shows. Real fixture: type in the panel and assert the remote fixture page saw no keystrokes. |
| AC-10 | Proxy unit tests: requests with no owner identity, a foreign `Origin`, a missing `X-Remote-GUI-Clipboard` header or a wrong method are refused, call no helper operation and return no clipboard text. |

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
