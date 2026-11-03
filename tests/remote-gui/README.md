# remote-gui verification

`bun test tests/remote-gui` runs the independent-package checks. Browser and native-agent cases require explicit opt-in and existing local tools. They use disposable apps, profiles and state; they do not configure live Tailscale or use an authenticated browser profile.

For the browser cases, build the plugin's CLI and set `REMOTE_GUI_TEST_BINARY` to that output. Point `REMOTE_GUI_PLAYWRIGHT_MODULE` to an existing matching Playwright installation, and set `REMOTE_GUI_CHROMIUM` and `REMOTE_GUI_FIREFOX` to its existing browser executables. The GUI test also needs the `REMOTE_GUI_XVFB`, `REMOTE_GUI_XAUTH`, `REMOTE_GUI_X11VNC`, `REMOTE_GUI_WEBSOCKIFY` and `REMOTE_GUI_NOVNC` paths documented in the plugin README.

```sh
REMOTE_GUI_VIEWER_E2E=1 bun test tests/remote-gui
```

The cases verify actual noVNC canvas input followed by CDP reattachment; shared-app assets, redirects, cookies and WebSockets; and native HTTP authentication in Chromium/Firefox. An unmanaged handler on another port receives the non-bearer binding cookie but no HTTP credential, even when it copies the protected realm. Replaying either proof alone fails. Browser contexts are created fresh, recordings are disabled and temporary code values are kept out of reported results.

Run the GUI component crash and expiry checks from the plugin module with the same existing GUI tool paths:

```sh
REMOTE_GUI_BROWSER_E2E=1 go test -race ./internal/browser -count=1
```

These checks kill only recorded process identities through pidfds. They verify closed viewer sockets, dead owned processes and private-session descendants, and deleted profiles. Loss of the guard exercises the documented next-lifecycle cleanup path.

The bounded native cases require an existing signed-in Copilot CLI. `REMOTE_GUI_NATIVE_CLI` can select that executable. They load the plugin through its native `--plugin-dir` option and the persistent remote-mode instruction, with isolated native state and shell/write tools denied:

```sh
REMOTE_GUI_NATIVE_E2E=1 bun test tests/remote-gui/native.e2e.test.ts
```

The current cases verify automatic skill loading without a per-request forwarding reminder, no localhost fallback when transport is unavailable, and preservation of an active auth-refresh challenge and its credential sentinel. They do not establish successful native-agent tailnet routing, second-device access, a completed provider login or general native-host coverage. Those remain separate acceptance exercises in the feature document.

The module's Unix LocalAPI and HTTPS fixture tests never contact the real daemon. A read-only host `doctor` result establishes available capabilities, not Serve write permission or another device's network access. Live acceptance must use an explicitly authorized disposable scope and fresh human viewer context.
