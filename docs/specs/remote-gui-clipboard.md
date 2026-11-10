---
status: in-progress
status_description: "Claimed for implementation on feat/remote-gui-clipboard."
branch: feat/remote-gui-clipboard
issue: https://github.com/michielvha/vh-adlc/issues/61
goal: "The owner can move text between their own device and the shared remote browser through explicit viewer controls, and the text never reaches logs, records or retained evidence."
covers:
  - plugins/remote-gui/
  - tests/remote-gui/
  - .github/workflows/ci.yml
---

# Plan: Clipboard controls for the remote-gui viewer

Add an owner-initiated clipboard panel to the shared-browser viewer, backed by a built-in X clipboard helper, so the owner can send text into the remote browser and copy text back out without automatic clipboard access on either side.

## Context

### Owner summary

Typing a long URL or token into the shared browser today means retyping it through the canvas. The viewer has no clipboard controls. The installed x11vnc does not move clipboard text in either direction between a viewer and Chromium, so the VNC connection cannot carry it.

This feature adds a small clipboard panel to the viewer page and a built-in clipboard helper in the session supervisor. The helper is a minimal X client written in plain Go, with no new host tool or module. It sets and reads the remote browser's CLIPBOARD selection. The panel talks to it over the viewer's existing owner-authenticated connection.

The owner pastes text into a field on their own device and presses **Send to remote browser**; the text becomes the remote clipboard, ready for Ctrl+V in Chromium. Opening the panel, or pressing **Refresh**, fetches what was last copied in the remote browser, and **Copy to this device** writes it to the local clipboard only on that click. Nothing reads the local clipboard on its own, and nothing writes to it without a click. Full Unicode works in both directions, up to 64 KiB.

Text stays in page memory and in the helper's memory only. The send field is marked so that neither Chromium nor Firefox saves it in its session-restore files, which they otherwise do for an ordinary text field. The panel clears after a send, on **Clear**, on disconnect and when the session ends; **Clear** also empties the remote clipboard. The panel shows whether the human or the agent controls the shared browser, and text sent while the agent has control is readable by the agent. Typing in the panel never reaches the remote browser. When control passes from the human to the agent, the handoff clears the remote clipboard and checks that it is empty before the agent's browser starts, so a credential pasted during human sign-in is not left for the agent. Clipboard text never appears in state records, diagnostics, command output, logs or retained test evidence.

Excluded: file transfer, images and rich text, automatic clipboard sync, the PRIMARY selection, service shares, and changes to auth-refresh.

A prototype of the helper passed a full round trip on this host, and review R-3 repeated it with real keystrokes through x11vnc; both are recorded in Background. The feature's own checks are planned, not run: viewer page and helper unit tests, a real round trip on Chromium and Firefox viewers, a handoff test with before and after checks, and a privacy sweep. The owner's decisions are listed under Design. Reviews R-1 to R-4 found blocking gaps; R-5 found none, and this revision applies its proposals. A final review is pending, and the owner has said to accept the feature if it finds no blocking gap. Acceptance authorizes implementation on a feature branch; publication, merge and release stay separate approvals.

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
- Review R-3 (finding F-09) repeated the round trip through the real input path on a scratch display: x11vnc 0.9.17 with `-nosel`, a scratch Chromium 151 page and the prototype holding `Zürich € ✓ rev3-A`. RFB key events Control_L+v pasted `Zürich € ✓ rev3-A`; RFB Ctrl+A, Ctrl+C made the prototype read `rev3-B ✓ ü` as `UTF8_STRING`. x11vnc sent no ServerCutText and `CUT_BUFFER0` stayed absent.
- Browsers send no `Origin` header on a same-origin GET `fetch`, while POST and DELETE carry it; Chromium and Firefox both sent `Sec-Fetch-Site: same-origin` on the GET (review R-3, finding F-01). The proxy's existing origin check accepts a request without `Origin` and refuses only a different one (`plugins/remote-gui/internal/proxy/proxy.go`, `validOrigin`).
- The TypeScript viewer fixture runs when `REMOTE_GUI_VIEWER_E2E=1` and launches Chromium (`tests/remote-gui/browser.e2e.test.ts:7`, `:60`); a Firefox viewer is used by `tests/remote-gui/origin-auth.e2e.test.ts` (`:40`) and, through `tests/remote-gui/fixtures/browser-check.ts` with a private persistent Firefox profile, by `tests/remote-gui/native-routing.e2e.test.ts` (`:47`), when `REMOTE_GUI_FIREFOX` names one. The Go real-browser tests in `plugins/remote-gui/internal/browser` run when `REMOTE_GUI_BROWSER_E2E=1`. The CI real-browser step installs Xvfb, xauth, x11vnc, noVNC and websockify, not `xprop` (`.github/workflows/ci.yml`).
- The handoff holds the browser runtime's mutex for its whole transition, and `healthy()` takes the same mutex (`plugins/remote-gui/internal/browser/phase.go:71-72`, `:95-97`). Tests in `plugins/remote-gui/internal/session` build browser handles with fake handoff functions (`plugins/remote-gui/internal/session/handoff_test.go:81`, `:156`), while `plugins/remote-gui/internal/browser/lifecycle_test.go` drives the runtime's handoff with fakes. CI runs `go test -race ./...` before installing Xvfb, and its real-browser step runs only `./internal/browser` (`.github/workflows/ci.yml`).
- Chromium and Firefox save the contents of an ordinary `textarea` in their session-restore files. Review R-4 (finding F-01) found a typed sentinel in a Chromium profile's `Default/Sessions` files and in Firefox's `sessionstore.jsonlz4`. A probe on 2026-11-10 typed a different sentinel into each of five fields on a 127.0.0.1 page in Chromium 151 and Playwright's Firefox build, waited 16 seconds and closed each browser: only the plain `textarea` appeared, in Chromium's `Default/Sessions/Session_*` and `Tabs_*` files and in Firefox's decompressed `sessionstore.jsonlz4`. A `textarea` with `autocomplete="off"`, a password input, a `contenteditable` element and a `textarea` cleared on `pagehide` did not appear in either browser.
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

- Clear the remote clipboard on every human-to-agent handoff, and fail the handoff closed into a retryable `handoff-failed` if clearing fails.
- Limit clipboard text to 64 KiB in both directions.
- Sync only the CLIPBOARD selection.
- A plain paste field, with no button that reads the local clipboard.
- Show remote text as soon as the panel opens.
- Use a built-in X helper instead of x11vnc or a new host tool, after R-2 showed x11vnc moves no text.
- Apply the R-2 test proposals as written: a native paste into a separate local test field to read the local clipboard, positive before and after checks for clearing, and an observable human-mode paste.
- Apply the R-3 proposals as written: Get returns held text directly, Set is refused during a handoff, oversized remote text is tested, and selection checks run in a Go test.
- Apply the R-4 proposals as written: keep the send field out of session restore, refuse a Send whose browser mode changed, show the browser mode and warn about agent-mode sends, clear the remote area on a send, and test a failed clear next to the handoff code. This moves the failed-clear test from the session package, recorded under R-3, to the browser package, because a session-level double cannot reach the clear.
- Apply the R-5 proposals as written: render remote text as text only, check both panel areas in the viewer profile search, run the privacy sweep after cleanup, name the failed-clear test gates, and add glossary rows for every panel label.
- The read route accepts a same-origin request without `Origin`, using `Sec-Fetch-Site` and the custom header, as proposed in R-3 F-01. Remote text is shown unmasked, as chosen when the owner asked for it to show as soon as the panel opens.

Earlier answers about restarting x11vnc, reconnecting after a restart and the Latin-1 limit applied to the x11vnc design and no longer apply: the helper needs no x11vnc restart and carries full Unicode.

### Clipboard helper

A new package `plugins/remote-gui/internal/xclip` implements a minimal X11 client with the standard library only. The browser runtime creates one helper per session after Xvfb is ready, using the session's display socket and Xauthority file. It runs inside the supervisor process, so no new owned process is tracked. It offers three operations:

- **Set(text)**: create an unmapped window, take ownership of CLIPBOARD with a server timestamp from a zero-length PropertyNotify, and answer SelectionRequest events for `TARGETS`, `UTF8_STRING`, `STRING` (Latin-1, with characters outside it replaced) and `TEXT`; refuse other targets. The helper keeps the text in memory only while it owns the selection, and drops it on SelectionClear, Clear or stop.
- **Get()**: while the helper owns CLIPBOARD, return its held text without a round trip. Otherwise convert CLIPBOARD to `UTF8_STRING` on its own window, falling back to `STRING` decoded as Latin-1, and return the text. No owner returns an empty result. An INCR reply or text over 64 KiB returns `clipboard-too-large`.
- **Clear()**: take CLIPBOARD and PRIMARY with a helper window, destroy the window so neither selection has an owner, delete `CUT_BUFFER0` on the root window, and drop any held text. Then verify that CLIPBOARD and PRIMARY have no owner and `CUT_BUFFER0` is absent, and return `clipboard-clear-unverified` if not.

Each operation has a bounded timeout. The helper never logs text, and its errors carry fixed diagnostic codes only. The package also exposes probes for tests: the current owner of a selection, whether `CUT_BUFFER0` exists, and a setter that writes `CUT_BUFFER0`. The browser runtime uses the helper through a small interface, so session-level tests can substitute a double.

x11vnc gains `-nosel`, so only the helper touches selections and cut buffers. A unit test asserts the exact x11vnc argument list.

### Clipboard routes

The viewer proxy serves `/__remote_gui/clipboard` for browser sessions, behind the same owner authentication as every other viewer request:

- `POST` with a UTF-8 `text/plain` body up to 64 KiB and an `expected_mode` query parameter calls Set. A larger body returns 413 with `clipboard-too-large`. The response names the browser mode the text was set in.
- `GET` calls Get and returns `{"text": ..., "browser_mode": ...}`.
- `DELETE` calls Clear.

All three require the header `X-Remote-GUI-Clipboard: 1`, refuse a request whose `Origin` header is present and differs from the viewer origin, and refuse a request whose `Sec-Fetch-Site` header is present and not `same-origin`. A same-origin GET without `Origin` therefore passes. The routes return `Cache-Control: no-store` and send no CORS headers, so a cross-origin page cannot send the custom header. Responses and errors contain no text other than the requested clipboard value.

### Viewer panel

`plugins/remote-gui/internal/proxy/viewer.go` gains a collapsed clipboard panel in the header beside the status line. It contains:

- A `textarea` with `autocomplete="off"`, labelled **Text for the remote browser**. The owner pastes into it with the device's normal paste gesture, which uses no clipboard API and shows no prompt. The page also empties it on `pagehide`. **Send to remote browser** posts the text with the browser mode the panel currently shows. Only after a successful response does the page clear the field and the remote area, and show a short confirmation that names the browser mode and says to press Ctrl+V in the remote page. On failure the field keeps its text and the page shows why.
- A read-only, non-form text element labelled **Copied in the remote browser**. Opening the panel and pressing **Refresh** fetch the remote clipboard; the area then shows a character count and the text, unmasked. The page sets the text only through `textContent`, never as HTML, so markup in remote text shows literally and cannot run in the viewer's origin. **Copy to this device** calls `navigator.clipboard.writeText` inside that click handler. If the promise rejects, the page selects the text and asks the owner to copy it with their device's shortcut.
- **Clear**, which empties both areas and the in-memory value and sends `DELETE`.

The panel shows the current browser mode, from the latest clipboard response, and in agent mode it says that sent text is readable by the agent.

While focus is inside the panel, the `connect` and `resize` handlers do not call `remote.focus()`, so typing and pasting there are never sent as remote keystrokes, including when a phone keyboard resizes the viewport. Closing the panel returns focus to the canvas with `remote.focus()`. Controls have accessible labels and keyboard access.

The page never stores clipboard text outside page memory. It drops the in-memory value on `disconnect`, on `pagehide` and when the session expires. The viewer-access fetch, WebSocket URL and RFB credentials are unchanged.

### Clearing on human-to-agent handoff

The human-to-agent handoff in `plugins/remote-gui/internal/browser/phase.go` calls Clear after Chromium exits and before Chromium launches in agent mode. The runtime keeps a separate clipboard mutex that health checks never take. The handoff takes it to mark a mode switch before it closes Chromium, and again to unmark it after the new browser is ready. Set takes the clipboard mutex and is refused with `clipboard-busy` while a switch is marked, or when the request's `expected_mode` differs from the current mode. No Send can therefore land between the clear and the agent-mode launch, or reach a browser in a mode the owner did not see. The panel shows that refusal, refreshes the mode and keeps the field's text. If Clear returns an error, the handoff fails, the record moves to `handoff-failed` with that diagnostic, and Chromium is not launched in agent mode. A retried handoff runs Clear again. Xvfb, x11vnc and websockify keep running, so the viewer stays connected. The agent-to-human direction does not clear.

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
| Text for the remote browser | The send field where the owner pastes text to send. |
| Copied in the remote browser | The read-only area that shows the fetched remote clipboard text. |
| Refresh | The button that fetches the remote clipboard again. |
| Clear | The button that empties both panel areas and the remote clipboard. |

## Acceptance Criteria

- [ ] AC-01: In a fresh Chromium viewer and a fresh Firefox viewer, the owner can paste text into the panel, send it, and paste it into a page in the remote browser with Ctrl+V, in both human and agent modes.
- [ ] AC-02: Text copied inside the remote browser appears when the owner opens the panel or presses **Refresh**, and **Copy to this device** places it on the viewer device's clipboard in Chromium and Firefox.
- [ ] AC-03: The viewer never reads the local clipboard without the owner's paste gesture, never writes it without a click on **Copy to this device**, and keeps clipboard text only in page memory, which is empty after a send, **Clear**, disconnect and session stop. Neither viewer browser saves panel text in its profile, and after **Clear** the remote clipboard has no owner.
- [ ] AC-04: Text up to 64 KiB, including characters outside Latin-1, arrives unchanged in both directions, and larger text in either direction is refused with a message in the panel.
- [ ] AC-05: Synthetic clipboard sentinels sent in both directions appear in no remote-gui command output, state record, diagnostic, supervisor or child log, test artifact or retained evidence file, and none remains in the session directory once the session has stopped and its remote browser profile is deleted.
- [ ] AC-06: After a human-to-agent handoff, CLIPBOARD and PRIMARY have no owner and `CUT_BUFFER0` is absent on the session display, and the viewer stays connected. A Send during a handoff, or one pressed for a browser mode that has since changed, is refused and never reaches the agent's browser. A failed clear leaves a `handoff-failed` record without an agent-mode browser, and a retried handoff then succeeds.
- [ ] AC-07: Existing service shares, owner-restricted access, loopback native-code access, browser phases, legacy records and private cleanup keep their supported behavior, and the module's race tests, vet, pinned lint and tidy checks pass.
- [ ] AC-08: The viewer, README and skill use the glossary labels, and the README and skill describe the panel with the glossary terms, the privacy and clearing rules, the browser permission behavior and the size limit, and contain no claim that the clipboard syncs automatically.
- [ ] AC-09: Typing or pasting in the panel never reaches the remote browser, including across reconnects and viewport resizes, and **Send to remote browser** neither clears the field nor confirms a send that did not succeed.
- [ ] AC-10: The panel's same-origin requests succeed in Chromium and Firefox, while clipboard routes refuse requests without the owner's authentication, with a different `Origin`, with a `Sec-Fetch-Site` other than `same-origin`, or without the clipboard header, and return no clipboard text in those refusals.
- [ ] AC-11: The panel shows whether the human or the agent controls the shared browser, warns in agent mode that sent text is readable by the agent, and names the mode in each send confirmation.
- [x] AC-12: Remote clipboard text is always shown as literal text in the viewer, never interpreted as markup.
      Evidence: 2026-11-10, `REMOTE_GUI_VIEWER_E2E=1 bun test tests/remote-gui/viewer-page.e2e.test.ts` in Chromium and Firefox: a GET returning `<img src=x onerror=alert(1)><b>x</b>` shows exactly those characters in **Copied in the remote browser**, and the page has no element inside the area and no `img` anywhere; the only code that writes the area uses `textContent`, and an `innerHTML` mutation fails the test.

## Test Plan

| Criterion | Proof |
| --- | --- |
| AC-01 | Extend the TypeScript viewer fixture `tests/remote-gui/browser.e2e.test.ts` (`REMOTE_GUI_VIEWER_E2E=1`). In a fresh Chromium viewer context, and in a Firefox viewer when `REMOTE_GUI_FIREFOX` is set, send a sentinel that differs from the marker, focus an input on a test fixture page in the remote browser, and press Ctrl+V through the viewer canvas so the key reaches Chromium as an X event. The fixture page copies each pasted value into sessionStorage. In agent mode read it through CDP; in human mode hand off to agent first, then read sessionStorage through CDP. CI runs the Chromium half; the acceptance evidence records a local run with `REMOTE_GUI_FIREFOX` for the Firefox half. |
| AC-02 | Same fixture and engines: in agent mode, copy a sentinel on the fixture page with a CDP `copy` editing command; open the panel and assert the text; click **Copy to this device** in Chromium without granting clipboard-write and in Firefox; then paste natively into a separate local test field and assert the value. Also send a sentinel and immediately press **Refresh**, asserting the held text returns without a timeout. |
| AC-03 | Viewer page tests with a stubbed `navigator.clipboard` that records calls: no `readText` call ever, and `writeText` only inside the click handler. Assert empty page state, including the remote area, after send, **Clear**, a simulated disconnect and stop, and that storage APIs hold no sentinel. Real fixture: with persistent scratch viewer profiles in Chromium and Firefox, type a sentinel into the send field and fetch a second, remote sentinel into **Copied in the remote browser** with **Refresh**, wait 16 seconds, close the browser, and search every profile file, decompressing Firefox's `jsonlz4` files, for both sentinels; any match fails. A viewer page test asserts that the remote area is not a form control. Go real-browser test (`REMOTE_GUI_BROWSER_E2E=1`) in `plugins/remote-gui/internal/browser`: after the Clear route, a second helper connection on the session display reports no CLIPBOARD owner. |
| AC-04 | Helper tests in `plugins/remote-gui/internal/xclip` against a scratch Xvfb, gated by `REMOTE_GUI_BROWSER_E2E=1` and added to the CI real-browser step: Set then Get on the same helper and on a second helper round trip `Zürich € ✓` and a 64 KiB string exactly; a second client owning CLIPBOARD with more than 64 KiB, and one answering with INCR, make Get return `clipboard-too-large`; a 64 KiB plus one byte POST returns 413; `STRING` fallback decodes Latin-1. Viewer page tests: both refusals show a message. The AC-01 and AC-02 sentinels include `€` and `✓`. |
| AC-05 | Run the AC-01 and AC-02 fixtures with unique sentinels that differ from the marker, stop the session, run `cleanup` until it reports `stopped`, and assert that the remote browser profile is gone. Then search command output, the session directory, state records, diagnostics, supervisor logs and all test artifacts for each sentinel; any match fails. |
| AC-06 | Go real-browser test (`REMOTE_GUI_BROWSER_E2E=1`) in `plugins/remote-gui/internal/browser`: in human mode, Set a sentinel and assert through a second helper connection that CLIPBOARD returns it; set `CUT_BUFFER0` through that connection and assert it exists. Hand off to agent; assert no CLIPBOARD or PRIMARY owner, `CUT_BUFFER0` absent and the viewer WebSocket still open. Start a Set concurrently with a handoff and assert it either fails with `clipboard-busy` or completes before the clear, and that the agent-mode display holds no sentinel; a Set with `expected_mode=human` after the handoff fails with `clipboard-busy`. In `plugins/remote-gui/internal/browser/lifecycle_test.go`, ungated, with a clipboard double that fails Clear once: the handoff returns the diagnostic before a browser child is added, and a second handoff calls Clear again before it attempts the launch. Under `REMOTE_GUI_BROWSER_E2E=1`, with the same double injected into a real runtime, the retried handoff reaches ready agent mode. A separate fake-handle test in `plugins/remote-gui/internal/session` keeps a failed handoff `handoff-failed` across a supervisor health tick. |
| AC-07 | Run `go test -race ./...`, `go vet ./...`, golangci-lint v2.15.0 `config verify` and `run`, and `go mod tidy -diff` in `plugins/remote-gui`, plus the existing service, origin-auth and native-routing fixtures in `tests/remote-gui`. |
| AC-08 | Viewer page test: the panel's labels and button names match the glossary. Review the README and skill diff against the glossary and design; `bun test tests/vh-adlc` and the package test in `tests/remote-gui/package.test.ts` pass; grep both files for automatic-sync wording. |
| AC-09 | Viewer page tests: with focus in the panel, fire `connect` and `resize` and assert focus stays in the panel and no key event reaches the RFB stub; with a failing POST, assert the field keeps its text and no confirmation shows. Real fixture: type in the panel and assert the remote fixture page saw no keystrokes. |
| AC-10 | Real fixture: the panel's GET, POST and DELETE succeed in Chromium and, with `REMOTE_GUI_FIREFOX`, in Firefox. Proxy unit tests: requests with no owner identity, a foreign `Origin`, `Sec-Fetch-Site: cross-site` or `same-site`, a missing `X-Remote-GUI-Clipboard` header or a wrong method are refused, call no helper operation and return no clipboard text; a GET with no `Origin` and `Sec-Fetch-Site: same-origin` passes. |
| AC-11 | Viewer page tests: the panel shows the mode from the clipboard response, shows the agent-mode warning only in agent mode, and the send confirmation names the mode. Real fixture: the mode shown changes after a handoff. |
| AC-12 | Viewer page test: a GET returning `<img src=x onerror=alert(1)>` and `<b>x</b>` shows those characters literally in the remote area, creates no element and runs no handler. |

## Tasks

- [x] T1 `plugins/remote-gui/internal/xclip/xclip_test.go` - helper tests gated by `REMOTE_GUI_BROWSER_E2E=1` on a scratch Xvfb with a cookie file: Set then Get on the same helper and on a second helper return `Zürich € ✓` and a 64 KiB string exactly; a second client owning CLIPBOARD with more than 64 KiB, and one answering with INCR, make Get return `clipboard-too-large`; the `STRING` fallback decodes Latin-1; Clear leaves no CLIPBOARD or PRIMARY owner and no `CUT_BUFFER0`; the owner, cut-buffer and setter probes work; a wrong cookie is refused. They fail because the package does not exist (AC-03, AC-04, AC-06)
      Evidence: 2026-11-10, `REMOTE_GUI_BROWSER_E2E=1 go test -race ./internal/xclip -count=1` failed to build with `undefined: Display`, `undefined: Helper`, `undefined: Open` and `undefined: MaxText`, because the package has no implementation yet; the module checks stay red until T2.
- [x] T2 `plugins/remote-gui/internal/xclip/` - the standard-library X11 client with Set, Get, Clear, bounded timeouts, fixed error codes, the test probes and no logging of text; T1 passes with `REMOTE_GUI_BROWSER_E2E=1` and `go test -race ./...` passes without it (AC-04)
      Evidence: 2026-11-10, `REMOTE_GUI_BROWSER_E2E=1 go test -race ./internal/xclip -count=1 -v` with the runtime.env Xvfb and xauth, failed to build at T1 and now passes all five tests (round trips on one and two helpers including exactly 64 KiB, oversized and INCR replies, Latin-1 fallback, Clear with probes, refused cookie); `go test -race ./...`, `go vet ./...`, golangci-lint v2.15.0 `config verify` and `run` (0 issues) and `go mod tidy -diff` pass without the gate. Get confirms ownership with a GetSelectionOwner reply from the server before returning held text, so it never converts through its own window.
- [x] T3 `.github/workflows/ci.yml` - the real-browser step runs `go test -race ./internal/browser ./internal/xclip -count=1`; the same command passes locally with `REMOTE_GUI_BROWSER_E2E=1` and the host tools from `runtime.env` (AC-04)
      Evidence: 2026-11-10, `REMOTE_GUI_BROWSER_E2E=1 go test -race ./internal/browser ./internal/xclip -count=1` with the runtime.env host tools passes both packages locally (browser 33.8s, xclip 1.4s); a CI-only change has no failing test to write first, and the hosted run is not observed here because nothing is pushed.
- [x] T4 `plugins/remote-gui/internal/browser/browser_test.go`, `plugins/remote-gui/internal/browser/lifecycle_test.go` - ungated tests that fail on the current code: the x11vnc argument list includes `-nosel`; with a clipboard double that fails Clear once, a human-to-agent handoff returns the diagnostic before a browser child is added, and the retry calls Clear again before it attempts the launch; Set is refused with `clipboard-busy` while a switch is marked and when `expected_mode` differs from the clipboard lock's copy of the mode; every handoff exit, failed or not, clears the switch mark (AC-06)
      Evidence: 2026-11-10, `go test -race ./internal/browser -count=1` failed to build with `undefined: vncArgs`, `unknown field clip in struct literal of type runtime` and `r.clipSwitching undefined`, because the runtime has no clipboard yet; module checks stay red until T5.
- [x] T5 `plugins/remote-gui/internal/browser/browser.go`, `plugins/remote-gui/internal/browser/phase.go`, `plugins/remote-gui/internal/session/session.go` - one helper per session behind a small interface on `BrowserHandle`, `-nosel`, a clipboard mutex that health checks never take and that guards the switch mark and its own copy of the browser mode, and Clear in the human-to-agent handoff after Chromium exits and before the agent launch; T4 passes and `go test -race ./...` passes (AC-06)
      Evidence: 2026-11-10, `go test -race ./internal/browser -count=1 -v` failed to build at T4 and now passes the x11vnc argument, failed-clear, Set-refusal and switch-mark tests; `go test -race ./...`, `go vet ./...`, golangci-lint v2.15.0 `config verify` and `run` (0 issues) and `go mod tidy -diff` pass, and `REMOTE_GUI_BROWSER_E2E=1 go test -race ./internal/browser ./internal/xclip -count=1` still passes the existing real-browser start, handoff and crash tests with the helper opened at start. After a failed handoff the clipboard follows the old mode unless a new browser was spawned.
- [x] T6 `plugins/remote-gui/internal/proxy/proxy_test.go` - route tests that fail because `/__remote_gui/clipboard` does not exist: no owner identity, a foreign `Origin`, `Sec-Fetch-Site: cross-site` or `same-site`, a missing `X-Remote-GUI-Clipboard` header and a wrong method are refused without calling the helper and without clipboard text; a GET with no `Origin` and `Sec-Fetch-Site: same-origin` passes; a body over 64 KiB returns 413 `clipboard-too-large`; responses carry `Cache-Control: no-store`, no CORS headers and `browser_mode`; `clipboard-busy` reaches the caller (AC-04, AC-10)
      Evidence: 2026-11-10, `go test -race ./internal/proxy -count=1` failed to build with `undefined: Clipboard`, `unknown field Clipboard in struct literal of type Options` and `undefined: MaxClipboardText`, because the clipboard route does not exist; the missing owner identity is checked both without loopback credentials and through a Tailscale identity proxy with no or another login.
- [x] T7 `plugins/remote-gui/internal/proxy/proxy.go`, `plugins/remote-gui/internal/session/daemon.go` - the clipboard routes, wired from the session's browser handle into the proxy options; T6 passes (AC-10)
      Evidence: 2026-11-10, `go test -race ./internal/proxy -count=1 -run Clipboard -v` failed to build at T6 and now passes all four route tests; the full module checks pass (race tests, vet, lint v2.15.0 with 0 issues, tidy). A scratch loopback session built from this tree answered POST, GET and DELETE through `curl` with `browser_mode` agent, returned the sent text and then empty text after DELETE, and stopped with only `state.json` left; browser fetches are covered later by T12.
- [x] T8 `tests/remote-gui/viewer-page.e2e.test.ts`, `.github/workflows/ci.yml` - viewer page tests under `REMOTE_GUI_VIEWER_E2E=1`, run in CI's real-browser step: they get the page from the built proxy, serve a stub `/core/rfb.js` and stub clipboard routes, and drive the page with the existing `playwright-core` in Chromium, and in Firefox when `REMOTE_GUI_FIREFOX` is set. They check: no `readText` call and `writeText` only in the click handler; empty page state after send, **Clear**, disconnect and stop, and no sentinel in storage APIs; the remote area is not a form control and markup shows literally with no element created; focus stays in the panel on `connect` and `resize` and no key reaches the RFB stub; a failed POST keeps the field and shows no confirmation; the mode and the agent-mode warning show and the confirmation names the mode; both size refusals show a message; labels match the glossary. They fail because the panel does not exist (AC-03, AC-04, AC-08, AC-09, AC-11, AC-12)
      Evidence: 2026-11-10, `REMOTE_GUI_VIEWER_E2E=1 bun test tests/remote-gui/viewer-page.e2e.test.ts` with the runtime.env tools, a locally built binary and `REMOTE_GUI_FIREFOX` set, failed in Chromium and Firefox at `getByRole('button', { name: 'Clipboard' })` after the page came from a scratch session's proxy, loaded the stub RFB and focused it on connect, because the panel does not exist; CI runs the Chromium half in the real-browser step.
- [x] T9 `plugins/remote-gui/internal/proxy/viewer.go` - the clipboard panel as designed; T8 passes and the existing proxy viewer test still passes (AC-03, AC-09, AC-11, AC-12)
      Evidence: 2026-11-10, `REMOTE_GUI_VIEWER_E2E=1 bun test tests/remote-gui/viewer-page.e2e.test.ts` with `REMOTE_GUI_FIREFOX` set failed at T8 and now passes in Chromium and Firefox; mutating remote text to `innerHTML` or refocusing the canvas on every connect makes it fail. The module checks pass, including `TestViewerCredentialsAndAssetsStayBehindAuthentication`, and `bun test tests/remote-gui/browser.e2e.test.ts` still passes both real noVNC cases.
- [ ] T10 `plugins/remote-gui/internal/browser/browser_test.go` - real-browser tests under `REMOTE_GUI_BROWSER_E2E=1`: in human mode a Set is visible to a second helper connection and a written `CUT_BUFFER0` exists; after a handoff to agent there is no CLIPBOARD or PRIMARY owner, no `CUT_BUFFER0`, and the viewer WebSocket is still open; a Set racing the handoff either fails with `clipboard-busy` or lands before the clear, and the agent display holds no sentinel; a Set with `expected_mode=human` afterwards fails; with the failing double injected into a real runtime the retried handoff reaches ready agent mode; after the Clear route a second connection sees no CLIPBOARD owner; all pass (AC-03, AC-06)
- [ ] T11 `plugins/remote-gui/internal/session/handoff_test.go` - a fake-handle test that keeps a failed handoff `handoff-failed` across a supervisor health tick; it passes (AC-06)
- [ ] T12 `tests/remote-gui/browser.e2e.test.ts`, `tests/remote-gui/fixtures/clipboard-page.ts` - the viewer fixture with a remote test page that copies pasted values into sessionStorage: send and Ctrl+V through the canvas in agent and human mode, read through CDP (after a handoff for human mode); a CDP `copy`, the panel showing it, **Copy to this device** without a clipboard-write grant and a native paste into a local field; send then **Refresh** returns the held text; GET, POST and DELETE succeed; typing in the panel reaches no remote page; the mode shown changes after a handoff and a **Refresh**; Firefox runs when `REMOTE_GUI_FIREFOX` is set; all pass (AC-01, AC-02, AC-09, AC-10, AC-11)
- [ ] T13 `tests/remote-gui/browser.e2e.test.ts` - with non-private persistent scratch viewer profiles in both engines, type a send sentinel, fetch a remote sentinel with **Refresh**, wait 16 seconds, close, and search every profile file with Firefox's `jsonlz4` files decompressed; a plain `textarea` sentinel typed on the same origin must be found, or the check fails as inconclusive; then stop the session, run `cleanup` until `stopped`, assert the remote profile is gone, and search command output, the session directory, records, diagnostics, logs and test artifacts for every sentinel; all pass (AC-03, AC-05)
- [ ] T14 `plugins/remote-gui/README.md`, `plugins/remote-gui/skills/remote-gui/SKILL.md` - the panel with the glossary labels, the privacy and clearing rules, the agent-mode warning, the browser permission behavior and the 64 KiB limit, with no automatic-sync claim; `bun test tests/remote-gui/package.test.ts` and `bun test tests/vh-adlc` pass and a grep finds no automatic-sync wording (AC-08)
- [ ] T15 `plugins/remote-gui/` - the full check set: `go test -race ./...`, `go vet ./...`, golangci-lint v2.15.0 `config verify` and `run`, `go mod tidy -diff`, and the service, origin-auth and native-routing fixtures in `tests/remote-gui`; all pass, with any regression fixed in this commit (AC-07)

## Open Questions

None.

## Review Log

| Date | Review | Kind | Commit | Model | Isolation | Outcome |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-09 | R-1 | spec | `8ff685a1883330fd0d50536c79788eae4cc0399f` | claude-opus-5-5 | procedural | Blocking x11vnc replacement health gap plus seven should-fix and nit findings. |
| 2026-11-09 | R-2 | spec | `4891dcc7d97e9c725fbef93c83a7413f59321aa8` | claude-opus-5-5 | procedural | Blocking: the installed x11vnc moves no clipboard text in either direction; six should-fix findings. |
| 2026-11-09 | R-3 | spec | `a5ef9e6204cad85777293bb5ec33b505f6311be4` | claude-opus-5-5 | procedural | Blocking: same-origin GET carries no Origin header; six should-fix and two nit findings. |
| 2026-11-09 | R-4 | spec | `05b51e9093dacbb1bc2df87bb88772e9555c1986` | claude-opus-5-5 | procedural | Blocking: viewer browsers save the panel field in session-restore files; four should-fix and two nit findings. |
| 2026-11-10 | R-5 | spec | `c071bd4682d176391849c39b9eb873bdce972510` | claude-opus-5-5 | procedural | No blocking findings; three should-fix findings and three nits. |
| 2026-11-10 | R-6 | spec | `f7e3793255d966b726ecc76dc9a59d0b92b8b65b` | claude-opus-5-5 | procedural | No blocking findings; three should-fix findings and two nits, left in the record at the owner's direction. |
| 2026-11-10 | R-6 | spec | `f7e3793255d966b726ecc76dc9a59d0b92b8b65b` | n/a | n/a | accepted by owner |

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

### R-3

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design, Clipboard routes; Acceptance Criteria, AC-02 and AC-10
EVIDENCE: The design says all three routes "require an `Origin` header equal to the viewer origin". Browsers do not send Origin on a same-origin GET fetch. I served a page on a scratch 127.0.0.1 origin and called fetch('/__remote_gui/clipboard') with the header X-Remote-GUI-Clipboard: 1 and credentials 'same-origin', then POST and DELETE, from headless Chromium (/usr/bin/chromium-browser) and Playwright Firefox through playwright-core 1.59.1. The server logged, for both engines: "GET origin=(absent) x=1 sfs=same-origin", "POST origin=http://127.0.0.1:38174", "DELETE origin=http://127.0.0.1:38174". Built as written, every panel open and every Refresh is refused, so AC-02 cannot pass, and the AC-10 proof would treat the refusal as correct. The existing validOrigin accepts a request with no Origin and rejects only a different one (plugins/remote-gui/internal/proxy/proxy.go, validOrigin: `if origin := r.Header.Get("Origin"); origin != "" && origin != p.origin.String()`).
PROPOSAL: Define a check that a real same-origin GET passes. For example, refuse a present Origin that differs, require Sec-Fetch-Site same-origin when that header is present, and keep the custom header. Or make the read a POST. Add a real-browser assertion that the panel's GET succeeds in Chromium and Firefox, and make AC-10's proof match the chosen rule.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan, AC-03 and AC-06
EVIDENCE: The AC-03 row says "`xprop` reports no CLIPBOARD owner". xprop has no option that reports a selection owner; `xprop -help` on a scratch display lists only -id, -name, -font, -remove, -set, -root, -len, -notype, -fs, -frame, -f, -spy and -version. The AC-06 row asserts "no CLIPBOARD or PRIMARY owner" and uses "a helper Get" in the "Real fixture", but names no probe. The real viewer fixture is TypeScript run against the built binary (tests/remote-gui/browser.e2e.test.ts:42), so it cannot call the Go helper package, and no clipboard route exposes PRIMARY or tells "no owner" apart from an owner with empty text. The host has no xsel, xclip or xdotool (`which` found none). The CI real-browser step installs only "xvfb xauth x11vnc novnc websockify" (.github/workflows/ci.yml, Prepare real browser verification), not the package that provides xprop, while Design says "No module or host dependency is added".
PROPOSAL: Name the probe for selection owners and CUT_BUFFER0, and say where it runs. One option is to put these assertions in a Go test under REMOTE_GUI_BROWSER_E2E in internal/browser that opens a second xclip connection on the session display. Another is a test-only probe built from the package. If xprop stays, add it to the CI install list and to the test prerequisites.

FINDING: F-03
KIND: factual
SEVERITY: nit
WHERE: Test Plan, AC-01 and AC-02
EVIDENCE: The AC-01 row says "Extend the real noVNC browser fixture (`REMOTE_GUI_BROWSER_E2E=1`) and `tests/remote-gui/browser.e2e.test.ts`". That file is gated by `const enabled=process.env.REMOTE_GUI_VIEWER_E2E==='1'` (tests/remote-gui/browser.e2e.test.ts:7). REMOTE_GUI_BROWSER_E2E gates the Go tests in plugins/remote-gui/internal/browser (browser_test.go:103, 196; lifecycle_test.go:132). browser.e2e.test.ts launches only Chromium (line 60). A Firefox viewer appears only in origin-auth.e2e.test.ts through REMOTE_GUI_FIREFOX (line 40), and the CI step runs browser.e2e.test.ts with no Firefox variable.
PROPOSAL: Name REMOTE_GUI_VIEWER_E2E for the TypeScript fixture, and say how the Firefox viewer is provided (REMOTE_GUI_FIREFOX) and whether CI or only a local run covers the Firefox half of AC-01 and AC-02.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan, AC-06; Design, Clearing on human-to-agent handoff
EVIDENCE: The AC-06 row says "Real fixture: ... Inject a Clear failure, assert `handoff-failed` and no agent-mode browser after at least one supervisor health tick, then retry and assert ready agent mode." The real fixture drives the released binary through the CLI (browser.e2e.test.ts:45-48), and the design defines no way to make Clear fail there. The health tick runs only in the session daemon (plugins/remote-gui/internal/session/daemon.go, serve ticker loop), while the existing failure-injection tests work at runtime level with fakes (plugins/remote-gui/internal/browser/lifecycle_test.go:24-120) and run no daemon. A failure hook in the shipped binary would be a new production surface, and the design does not mention one.
PROPOSAL: State where the failure is injected and how the retry then succeeds. For example, give the runtime a clipboard interface that a session-level test replaces with one that fails once, and run that test under the daemon tick. Or state explicitly that a test-only hook exists and how it is kept out of normal use.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Clipboard helper; Test Plan, AC-02 and AC-04
EVIDENCE: After **Send to remote browser**, the helper owns CLIPBOARD. Opening the panel or pressing **Refresh** then calls Get, which "convert[s] CLIPBOARD to `UTF8_STRING` on its own window". The X server sends the matching SelectionRequest back to the helper's own connection, which must answer it while Get waits for SelectionNotify. The design does not say whether Get returns the held text directly or serves its own request concurrently. A single synchronous event loop would hit the timeout. No proof covers this path: AC-04 uses "Set then a second client's Get", and AC-02 copies in Chromium before reading.
PROPOSAL: Define Get while the helper owns the selection, for example returning the held text without a round trip. Add a helper unit test for Set followed by Get on the same helper, and a viewer-flow check that sends text and then opens the panel.

FINDING: F-06
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Clearing on human-to-agent handoff; Context, Owner summary
EVIDENCE: The summary says the handoff "clears the remote clipboard and checks that it is empty before the agent's browser starts, so a credential pasted during human sign-in is not left for the agent". The handoff holds the runtime mutex (plugins/remote-gui/internal/browser/phase.go:95-97), but the clipboard routes call the helper directly, and the design states no ordering between a POST Set and the handoff's Clear. A Send that the owner pressed in human mode and that lands after Clear but before or after the agent-mode launch leaves that text in CLIPBOARD for the agent, and the page confirms it as sent. The viewer page shows no browser mode, so the owner cannot tell that the mode changed (viewer.go:10 status texts are connected, disconnected and authentication failed only).
PROPOSAL: Serialize clipboard operations with the handoff, for example by refusing Set with a fixed code while the record is in `handoff`, and running Clear and the agent-mode launch under the same lock that Set takes. Add a test that a Set racing a handoff either fails or is cleared.

FINDING: F-07
KIND: judgement
SEVERITY: should-fix
WHERE: Open Questions; Design, Owner decisions
EVIDENCE: Open Questions says "None.", and the Owner decisions list has six items. The design also settles trade-offs that the list does not include. (1) The 64 KiB limit in both directions, which is new in this revision (the earlier revisions f299eac, 4891dcc and dd6e4c9 had no size limit). (2) The remote text is shown "unmasked" with a character count, although it may be a credential copied in the remote browser. (3) A Clear error fails the handoff closed into `handoff-failed`, instead of continuing with a warning. The standard says "Every trade-off the document settles is an open question, including one the author would answer the same way the owner would."
PROPOSAL: Raise these as open questions with a recommendation, or record the owner's answers to them under Owner decisions if they were already given.

FINDING: F-08
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan, AC-04
EVIDENCE: AC-04 says "larger text is refused with a message" and "in both directions". The proof covers only the send direction: "a 64 KiB plus one byte POST returns 413". Nothing checks that remote text over 64 KiB, or an INCR reply, gives `clipboard-too-large` from Get, or that the panel shows a message in either case. A passing subset never upgrades a composite criterion.
PROPOSAL: Add a helper test where a second client owns CLIPBOARD with more than 64 KiB, and one that answers with INCR, asserting `clipboard-too-large`. Add viewer page tests that both refusals show a message.

FINDING: F-09
KIND: factual
SEVERITY: nit
WHERE: Context, Background
EVIDENCE: Background presents the prototype as proving "the helper approach", but its run did not start x11vnc and did not deliver Ctrl+V as an X key event. run.mjs drives Chromium only over CDP, and run-keys.log records FAIL for CDP key events. AC-01 depends on exactly the path the prototype skipped: viewer keys through x11vnc into Chromium while x11vnc runs with `-nosel`. I measured it in this review. I ran a scratch Xvfb :3817, x11vnc 0.9.17 with `-nosel` (plus -nopw for a scratch None-auth RFB client), a scratch Chromium 151 page, and the prototype's `own` command holding "Zürich € ✓ rev3-A". RFB KeyEvents Control_L+v produced `paste:"Zürich € ✓ rev3-A"` in the textarea (PASS). RFB Ctrl+A, Ctrl+C then made the prototype's `read` return `text="rev3-B ✓ ü"` as UTF8_STRING. x11vnc sent no ServerCutText, and CUT_BUFFER0 was "not found". I also confirmed that a wrong cookie is refused ("Invalid MIT-MAGIC-COOKIE-1 key"); the prototype's logs do not contain that observation.
PROPOSAL: Add a Background line for the round trip through x11vnc with `-nosel` and real X key events, and keep the CDP-only prototype result as the helper-level evidence.

### R-4

FINDING: F-01
KIND: factual
SEVERITY: blocking
WHERE: Design, Viewer panel; Design, Privacy; Acceptance Criteria, AC-03; Test Plan, AC-03
EVIDENCE: The design puts the owner's text in "A plain `textarea` labelled **Text for the remote browser**" and states "The page never stores clipboard text outside page memory". AC-03 requires that the viewer "keeps clipboard text only in page memory". I tested this. I served a page on a scratch 127.0.0.1 origin with a textarea and a `<pre>` whose text a script set to rev4REMOTEPRE. I launched Chromium 151 (/usr/bin/chromium-browser, headless) and Playwright Firefox (firefox-1569) through playwright-core 1.59.1, each with a scratch persistent profile, typed rev4FORMSENTINEL into the textarea, waited 12 s and closed the browser. The sentinel was then on disk in the Chromium profile's Default/Sessions/Session_* and Tabs_* files (stored as UTF-16) and in the Firefox profile's sessionstore.jsonlz4. The `<pre>` text was in neither profile. The AC-03 proof checks only page state and "that storage APIs hold no sentinel", so it passes while the owner's browser writes the pasted text to disk. Browsers leave password fields out of session restore, so a credential sent through the panel would be kept where one typed into a normal sign-in form would not.
PROPOSAL: Define how the panel keeps text out of browser session history, for example by clearing the field promptly and on pagehide, setting autocomplete="off" and showing remote text in a non-form element, and measure that the mechanism works in both engines. Add a real-browser step to the AC-03 proof that searches the viewer's scratch profile for the sentinel after the browser closes.

FINDING: F-02
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan, AC-06; Design, Clearing on human-to-agent handoff
EVIDENCE: The design puts the Clear call inside the browser runtime's handoff in plugins/remote-gui/internal/browser/phase.go, which imports internal/session. All six session test files are `package session` and build BrowserHandle values with fake Handoff funcs (plugins/remote-gui/internal/session/handoff_test.go:81, 124, 162, 211). A test in internal/session cannot build the browser runtime or reach its clipboard interface without an import cycle. Its "clipboard double that fails Clear once" can only sit behind a fake Handoff that returns an error, and TestFailedHandoffCanBeReconciled (handoff_test.go:156) already covers that case. Such a test passes whether phase.go calls Clear before the agent-mode launch, after it, or ignores its error, and with a fake handle the assertion "no agent-mode browser" is vacuous. The REMOTE_GUI_BROWSER_E2E test in the same row covers only the success path. This is the test placement the owner adopted from R-3 F-04, but as written it never runs the code it is meant to prove.
PROPOSAL: Put the failed-clear proof in internal/browser, where lifecycle_test.go already drives runtime.handoff with fakes. A clipboard double that fails once should make handoff return the diagnostic before r.launch adds a browser child, and a second handoff should call Clear again and then launch. If the tick check is still wanted, keep it as a separate fake-handle test in internal/session, and tell the owner the placement differs from the recorded R-3 decision.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Clearing on human-to-agent handoff; Design, Viewer panel; Context, Owner summary
EVIDENCE: The design says "Set takes the same runtime mutex as the handoff and is refused with `clipboard-busy` while a handoff is in progress". runtime.healthy() also takes r.mu (plugins/remote-gui/internal/browser/phase.go:71-72), and the supervisor reaches it through BrowserHandle.Alive (browserControl.alive in internal/session/handoff.go). If Set blocks on r.mu, it waits for the handoff to finish and then sets the clipboard after the agent-mode launch, which AC-06 forbids. If Set uses TryLock, a health check holding the mutex refuses it at random. Neither reading gives the stated rule. A Send that arrives just before the session record enters `handoff`, or just after the handoff completes, also lands in the agent-mode browser. The viewer shows no browser mode (viewer.go:10 has only the connected, disconnected and authentication-failed status texts), so the owner cannot tell where the text went. The Owner summary never says the panel also sends to the agent-mode browser, where the agent can read the clipboard through CDP.
PROPOSAL: Specify the mechanism. For example, capture the browser generation (r.generation) or a handoff flag when the request arrives, recheck it under the mutex, and refuse Set if it changed. Have the panel show the current browser mode, or have the Send confirmation name it, and say in the Owner summary that agent-mode sends are readable by the agent.

FINDING: F-04
KIND: judgement
SEVERITY: should-fix
WHERE: Acceptance Criteria, AC-03; Design, Viewer panel; Context, Owner summary; Test Plan, AC-02 and AC-03
EVIDENCE: AC-03 says page memory "is empty after a send", and the Owner summary says "The panel clears after a send". The design clears only the field: "Only after a successful response does the page clear the field". The panel has to be open to send, and opening it fetches remote text into **Copied in the remote browser**, which the design never clears on a send. The AC-02 proof ("send a sentinel and immediately open the panel, asserting the held text returns") expects page memory to hold the sent text right after the send. The AC-03 proof's "Assert empty page state after send" leaves an implementer to guess whether the remote area must be wiped.
PROPOSAL: Decide whether a send also clears or refreshes the remote area. Then make the Design, the Owner summary, AC-03 and the AC-02 and AC-03 proofs agree.

FINDING: F-05
KIND: judgement
SEVERITY: should-fix
WHERE: Open Questions; Design, Owner decisions
EVIDENCE: Open Questions says "None.". The R-3 decision recorded under Owner decisions lists "Get returns held text directly, Set is refused during a handoff, the failed-clear test uses a session-level test double, oversized remote text is tested, and selection checks run in a Go test". R-3 F-01 offered two options: accept a missing Origin and add a Sec-Fetch-Site rule, or make the read a POST. The design adopts the first without a recorded decision. R-3 F-07 also asked whether remote text should be shown "unmasked" with a character count. The decisions record when it is shown ("Show remote text as soon as the panel opens") but not whether it is masked. The standard says "Every trade-off the document settles is an open question, including one the author would answer the same way the owner would."
PROPOSAL: Raise the read-route check and the unmasked display as open questions, each with a recommendation, or record the owner's answers under Owner decisions.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Test Plan, AC-04
EVIDENCE: The AC-04 row specifies "Helper unit tests against a scratch Xvfb" but names no gate. CI's "Check the remote-gui module" step runs `go test -race ./...` before any Xvfb is installed, and the real-browser step runs only `go test -race ./internal/browser -count=1` (.github/workflows/ci.yml, "Verify browser phases and session continuity"). An ungated test would therefore fail the unit step, and a test gated like the browser tests would never run in CI. `covers` does not list .github/workflows/ci.yml.
PROPOSAL: Name the gate for the internal/xclip display tests. Either add the package to the real-browser CI step and add .github/workflows/ci.yml to `covers`, or state that only a local run covers these tests.

FINDING: F-07
KIND: factual
SEVERITY: nit
WHERE: Design, Clipboard helper; Test Plan, AC-06
EVIDENCE: The design says "The package also exposes read-only probes for tests: the current owner of a selection and whether `CUT_BUFFER0` exists". The AC-06 proof, a Go test in plugins/remote-gui/internal/browser, says "set `CUT_BUFFER0` through that connection and assert it exists". A test in another package can write CUT_BUFFER0 only through an exported write operation, and the design lists none.
PROPOSAL: Add a test-facing CUT_BUFFER0 setter to the helper's listed API, or name another way for the AC-06 test to fill the cut buffer before the handoff.

### R-5

FINDING: F-01
KIND: factual
SEVERITY: should-fix
WHERE: Test Plan, AC-05; Acceptance Criteria, AC-05
EVIDENCE: The AC-05 row says "Run the AC-01 and AC-02 fixtures with unique sentinels ... then search command output, the session directory, state records, diagnostics, supervisor logs and all test artifacts for each sentinel; any match fails." The remote Chromium profile is inside the session directory (`profile := filepath.Join(directory, "profile")`, plugins/remote-gui/internal/browser/browser.go:305-306), and Chromium runs with `--restore-last-session` (phase.go:23) and `restore_on_startup: 1` (browser.go:318). The AC-01 fixture page "copies each pasted value into sessionStorage", and the human-mode proof depends on that storage surviving the handoff, which works because Chromium writes it to disk. I measured this in this review. On a scratch Xvfb :4719 with a scratch Chromium 151.0.7922.137 profile, I inserted R5SSSENTINELQ into a 127.0.0.1 page input whose input handler stores the value in sessionStorage, and waited 16 s. With the browser still running, the sentinel was in the profile's `Default/Sessions/Session_*` and `Default/Session Storage/000003.log` (as UTF-16). The AC-02 fixture field that holds the copied sentinel lands in the same Sessions files. A sweep of the session directory before stop therefore matches on correct code. After stop the profile is deleted (browser.go:255-256), but the row does not say when the sweep runs, and AC-05 itself excludes no file.
PROPOSAL: Say that the sweep runs after the session stops and cleanup has removed the profile, and assert that removal. Alternatively, exclude the remote browser's own profile from the sweep and say in AC-05 that it covers remote-gui's outputs, records, logs and test evidence, not what remote pages store.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan, AC-03; Acceptance Criteria, AC-03
EVIDENCE: AC-03 says "Neither viewer browser saves panel text in its profile". The real-browser part of the AC-03 proof only covers the send field: "type a sentinel into the panel, wait 16 seconds, close the browser, and search every profile file". Remote text in **Copied in the remote browser** is never fetched before the browser closes. The design keeps it out of session restore only by using "A read-only, non-form text element". I measured the alternative in this review. On a 127.0.0.1 page in Chromium 151 and Playwright Firefox (firefox-1569), each with a scratch persistent profile, a script set a `readonly` textarea to R5ROSENTINELX and a `<pre>` to R5PRESENTINELX; after 16 s and a close, R5ROSENTINELX was in Chromium's `Default/Sessions/Session_*` and `Tabs_*` files and in Firefox's decompressed `sessionstore.jsonlz4`, while the `<pre>` text was in neither. An implementation that shows remote text in a readonly textarea would pass every AC-03 check while the owner's browser writes remote clipboard text to disk. A passing subset never upgrades a composite criterion.
PROPOSAL: In the real profile check, also fetch a separate remote sentinel into **Copied in the remote browser** (open the panel or press **Refresh**) before waiting and closing, and fail on either sentinel. Optionally add a viewer page test that the remote area is not a form control.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Viewer panel; Test Plan, AC-02 and AC-04
EVIDENCE: Remote clipboard text comes from whatever owns CLIPBOARD on the session display: any page in the remote browser that writes the clipboard after a click, or the agent through CDP in agent mode. The design only says the area "shows a character count and the text, unmasked", and it fetches automatically "as soon as the panel opens". It does not say that the text is inserted only as text. The viewer page runs on the owner-authenticated origin, holds the VNC password from viewer-access (plugins/remote-gui/internal/proxy/viewer.go:21-28) and has no script-src restriction: its script is inline, and ServeHTTP adds only `Content-Security-Policy: worker-src 'none'` (plugins/remote-gui/internal/proxy/proxy.go, ServeHTTP). Remote text inserted as markup would run in that origin when the owner opens the panel. No viewer page test or real fixture uses a sentinel that contains markup.
PROPOSAL: State that remote text is set only through `textContent` (or an equivalent text-only API) and never parsed as HTML. Add a viewer page test where the GET returns markup such as `<img src=x onerror=...>` and assert that it shows literally and creates no element.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Test Plan, AC-06
EVIDENCE: The row asks for a test in plugins/remote-gui/internal/browser/lifecycle_test.go "with a clipboard double that fails Clear once", in which "a second handoff calls Clear again and launches agent mode". The existing fakes-driven tests in that file run ungated under CI's `go test -race ./...`, before any Xvfb or browser is installed (.github/workflows/ci.yml, "Check the remote-gui module"). Launching agent mode spawns `REMOTE_GUI_CHROMIUM` and waits for DevToolsActivePort, listener ownership and the marker tab (plugins/remote-gui/internal/browser/browser.go, launch), which cannot succeed there. The row does not say whether this test is gated by REMOTE_GUI_BROWSER_E2E with a real display, or whether it stops at proving that Clear runs again before launch is attempted. AC-06's "a retried handoff then succeeds" depends on which one.
PROPOSAL: Name the gate for the failed-clear test. Either run it under REMOTE_GUI_BROWSER_E2E against a real runtime with the double injected, or assert in the ungated test that the retry calls Clear again and reaches launch, and prove the successful agent launch in the gated test.

FINDING: F-05
KIND: judgement
SEVERITY: nit
WHERE: Design, Glossary; Acceptance Criteria, AC-08
EVIDENCE: The panel introduces the user-facing labels **Text for the remote browser**, **Copied in the remote browser**, **Refresh** and **Clear** (Design, Viewer panel). None of them has a Glossary row; the glossary lists only Clipboard panel, Clipboard helper, Send to remote browser, Copy to this device and Remote clipboard. AC-08 holds only the README and skill to "the glossary terms". The standard says "User-facing terms the feature introduces or changes appear in a glossary row and are held to it by a criterion."
PROPOSAL: Add glossary rows for the remaining labels and make a criterion, AC-08 or a viewer page test under AC-11, check that the viewer uses the glossary labels.

FINDING: F-06
KIND: factual
SEVERITY: nit
WHERE: Context, Background
EVIDENCE: Background says "a Firefox viewer is used only by `tests/remote-gui/origin-auth.e2e.test.ts` when `REMOTE_GUI_FIREFOX` names one (`:40`)". tests/remote-gui/native-routing.e2e.test.ts:47 also passes `firefox:process.env.REMOTE_GUI_FIREFOX` to tests/remote-gui/fixtures/browser-check.ts, which launches Firefox with a private persistent profile (`firefox.launchPersistentContext(profile, ...)`, browser-check.ts:27-34) for the identity-firefox case (tests/remote-gui/README.md:52).
PROPOSAL: Correct the sentence to name both users of REMOTE_GUI_FIREFOX. The browser-check fixture's persistent Firefox profile handling may also be reusable for the AC-03 profile search.

### R-6

FINDING: F-01
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan, AC-03; Context, Background
EVIDENCE: The AC-03 real fixture says "with persistent scratch viewer profiles in Chromium and Firefox, type a sentinel into the send field ... search every profile file ... any match fails". Nothing in it shows the search could ever find a saved field, so it passes whenever the profile writes no session-restore data at all. Background now points implementers at the fixture "tests/remote-gui/fixtures/browser-check.ts with a private persistent Firefox profile". That fixture launches Firefox with `firefoxUserPrefs:{'browser.privatebrowsing.autostart':true}` (browser-check.ts:34). I measured the effect in this review with Playwright Firefox (firefox-1569) through playwright-core: a scratch persistent profile, a plain `textarea` on a 127.0.0.1 page, a typed sentinel, a 16 s wait, then close. Without the pref, the sentinel was in the decompressed `sessionstore.jsonlz4`. With `browser.privatebrowsing.autostart: true`, it was in no profile file. If the AC-03 check reuses that fixture's profile setup, it goes green even when the send field is a plain textarea that a normal profile would save.
PROPOSAL: Require a non-private profile for the AC-03 profile search in both engines. Add a positive control: in the same profile and on the viewer origin, type a third sentinel into a plain `textarea`. The check fails as inconclusive unless that sentinel is found.

FINDING: F-02
KIND: judgement
SEVERITY: should-fix
WHERE: Test Plan, AC-03, AC-04, AC-08, AC-09, AC-11 and AC-12; Design, Compatibility
EVIDENCE: Six Test Plan rows depend on "Viewer page tests" that use "a stubbed `navigator.clipboard` that records calls", an "RFB stub", fired `connect` and `resize` events, "a simulated disconnect and stop", and a GET that returns markup. The viewer page is an inline module script inside a Go string constant that imports `/core/rfb.js` (plugins/remote-gui/internal/proxy/viewer.go:10). Nothing in the repository runs that script today. The only viewer test fetches the page and checks that it embeds no credential (plugins/remote-gui/internal/proxy/proxy_test.go, around lines 385-401). tests/remote-gui/package.json lists only `playwright-core` 1.64.1, with no DOM library. Design, Compatibility says "No module or host dependency is added". A DOM-library harness would add a dependency. A browser-backed harness needs Chromium, so it runs only in CI's REMOTE_GUI_VIEWER_E2E step (.github/workflows/ci.yml lines 112-130). The document does not say which one, which file holds these tests, how the test gets the page out of the Go constant, or whether CI runs them.
PROPOSAL: Name the harness, its file and its gate. For example, a bun test in tests/remote-gui that gets the page from the built proxy, serves a stub `/core/rfb.js` and drives the page through playwright-core in Chromium, and in Firefox when REMOTE_GUI_FIREFOX is set, under REMOTE_GUI_VIEWER_E2E. Say whether CI runs it.

FINDING: F-03
KIND: judgement
SEVERITY: should-fix
WHERE: Design, Clearing on human-to-agent handoff; Test Plan, AC-06
EVIDENCE: The design says "The handoff takes it to mark a mode switch before it closes Chromium, and again to unmark it after the new browser is ready", and Set is refused "when the request's `expected_mode` differs from the current mode". The handoff can return an error at many points before the new browser is ready: invalid mode, ownership change, marker focus, quit, close timeout, persist, locked profile, launch (plugins/remote-gui/internal/browser/phase.go:98-150), and now Clear. The design does not say whether the mark is cleared on those exits. If it is left set, every Send in `handoff-failed` returns `clipboard-busy`, including after `browser-close-needs-owner`, when human-mode Chromium is still running. The design also does not say where Set reads the "current mode". Today that is `r.current.BrowserMode`, guarded by `r.mu`, which the handoff holds for its whole run (phase.go:95-97). A Set that holds the clipboard mutex and then takes `r.mu` deadlocks against a handoff that holds `r.mu` and waits for the clipboard mutex. Reading it without `r.mu` is a data race under CI's `go test -race`. The AC-06 race test covers only a handoff that succeeds.
PROPOSAL: State that the clipboard mutex guards both the switch mark and its own copy of the browser mode, that every handoff exit clears the mark, and which mode Set compares against after a failed handoff. Add a failed-handoff case to the AC-06 concurrency test.

FINDING: F-04
KIND: judgement
SEVERITY: nit
WHERE: Acceptance Criteria, AC-11; Test Plan, AC-11; Context, Owner summary
EVIDENCE: The design says "The panel shows the current browser mode, from the latest clipboard response". It defines no polling and no other refresh trigger. The viewer stays connected through a handoff, so no `disconnect` or `connect` event fires (plugins/remote-gui/internal/browser/phase.go:95-152, quit.go:19-29). After a handoff, the panel keeps showing the old mode, and the agent-mode warning stays missing or stays shown, until the next fetch or a refused Send. AC-11 and the summary say the panel "shows whether the human or the agent controls the shared browser", and the AC-11 proof asserts "the mode shown changes after a handoff" without saying what makes it change. The `expected_mode` refusal keeps sends safe, but correct code fails a fixture that asserts the change without a fetch.
PROPOSAL: Say in AC-11 and the summary that the mode shown is as of the latest clipboard request. Have the AC-11 fixture press **Refresh**, or attempt a Send, after the handoff and before it asserts. Or define a trigger that refreshes the mode.

FINDING: F-05
KIND: judgement
SEVERITY: nit
WHERE: Scope; Acceptance Criteria, AC-03 and AC-08
EVIDENCE: The design plans for phone viewers ("including when a phone keyboard resizes the viewport"). The session-restore evidence covers only Chromium 151 and Playwright Firefox (Background, the 2026-11-10 probe), and AC-03 says "Neither viewer browser saves panel text in its profile". A viewer on an iPhone or iPad runs WebKit whatever browser app it is, and nothing measures or names what WebKit saves from the send field. Scope and AC-08 do not say which viewer engines the privacy claim covers.
PROPOSAL: State in Scope, and require in the README under AC-08, that the session-restore guarantee is verified for Chromium and Firefox viewers only. Alternatively, measure WebKit and add it to AC-03.

## Sources

- [S1] [Clipboard: writeText() method, MDN](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText): writing requires a secure context.
- [S2] [Clipboard: readText() method, MDN](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/readText): reading requires a secure context.
- [S3] [Clipboard API, security considerations, MDN](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API#security_considerations): Chromium writes need the clipboard-write permission or transient activation and reads request clipboard-read; Firefox writes need transient activation and reads show a paste context menu. The page does not state a permission rule for native paste into a text field; the design treats that as the browser's ordinary paste behavior and the real-browser tests confirm it.
- [S4] [Secure contexts, MDN](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts): 127.0.0.0/8, `::1` and `localhost` are potentially trustworthy origins.
