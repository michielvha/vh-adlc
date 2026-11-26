# Mobile feasibility probes

Run these probes against disposable synthetic sessions only. They are diagnostics for the mobile feature document. They do not certify the installed mobile implementation.

Load the existing remote-gui tool paths first. To check the target edit interface, run:

```sh
REMOTE_GUI_PROBE_EDIT_INTERFACE=1 bash tests/remote-gui/mobile-feasibility/run-editable-metadata.sh /tmp/rg-edit-interface-probe
```

The artifact directory must be new. The probe records whether the eight synthetic fields advertise `EditableText` and tries its target-specific insertion method on the plain field. It does not query contents.

For the RFB probe, point `REMOTE_GUI_TEST_BINARY` to a build of the selected plugin source and `REMOTE_GUI_PLAYWRIGHT_MODULE` to the installed Playwright core module as described in the [test README](../README.md). Run both scenarios:

```sh
node tests/remote-gui/mobile-feasibility/focus-race.cjs
node tests/remote-gui/mobile-feasibility/focus-race.cjs --during-key
```

Each command starts its own loopback session, confirms the first key reached A, then checks where a second key goes. The page moves focus after the acknowledgement in the first scenario. In the second, the page moves focus in the keydown handler. With unrestricted RFB key delivery, both runs should report `F1: global RFB input reached B after the binding acknowledged A` and exit 1. An earlier setup or timeout error is not that result.

### x11vnc controller transfer

Run each mode on a new Xvfb display. These commands use the configured x11vnc binary, libX11, libXtst and Python's `cryptography` package for the fixture's RFB authentication.

```sh
. /home/m/.config/remote-gui/runtime.env
export PATH="$(dirname "$REMOTE_GUI_XVFB"):$PATH"
probe=$(mktemp -d)
for mode in disable disconnect release; do
  xvfb-run -a -s '-screen 0 960x800x24 -nolisten tcp' \
    python3 tests/remote-gui/mobile-feasibility/vnc-controller-probe.py "$probe/$mode" "$mode"
done
```

The first two modes should exit 1 when transfer leaves the first client's button or Shift held or fails to move the pointer. The third mode closes the old transport and releases the fixture's known button and Shift before opening the new client's input permissions. It verifies that the old socket closes and that the new client can move the pointer, press both inputs and release them. This probe uses direct RFB connections and does not establish viewer WebSocket attribution, queued input behavior for every message type, keyboard target binding or Clipboard authorization.

### Firefox edit comparison

On a host with stock Firefox and the native X11 tools, run the private accessibility harness using a different new artifact directory each time.

```sh
REMOTE_GUI_METADATA_PROBE=firefox RG_FF_EDIT_METHOD=native bash tests/remote-gui/mobile-feasibility/run-editable-metadata.sh /tmp/rg-firefox-native
REMOTE_GUI_METADATA_PROBE=firefox RG_FF_EDIT_METHOD=insert bash tests/remote-gui/mobile-feasibility/run-editable-metadata.sh /tmp/rg-firefox-insert
REMOTE_GUI_METADATA_PROBE=firefox RG_FF_EDIT_METHOD=insert RG_FF_EDIT_CASE=switch bash tests/remote-gui/mobile-feasibility/run-editable-metadata.sh /tmp/rg-firefox-switch
REMOTE_GUI_METADATA_PROBE=firefox RG_FF_EDIT_METHOD=set bash tests/remote-gui/mobile-feasibility/run-editable-metadata.sh /tmp/rg-firefox-set
```

The native positive control must report both input and the expected synthetic mutation. With the tested Firefox version, the edit methods returned true without any field mutation. The fixture checks its own known synthetic values and reports a boolean. The accessibility client never reads text or field values.

### Chromium renderer comparison

With the same installed Chromium and Playwright module, run `node tests/remote-gui/mobile-feasibility/dom-range-probe.cjs` and `node tests/remote-gui/mobile-feasibility/edit-command-probe.cjs`. These fixtures compare editing primitives in an isolated Chromium profile. Browser automation is confined to these fixtures.

For the extension comparison, pass a new private directory to `node tests/remote-gui/mobile-feasibility/extension-probe.cjs`. Its temporary extension runs only on the fixture's exact loopback origin, sends the synthetic marker, and reports the intended edit and rejected stale edit. Never load it into an existing browser profile.

The [live stream fixture](live-stream/README.md) adds an actual noVNC framebuffer and a cooperating page with a guarded editor. The cooperating page is a test double for a browser integration, separate from remote-gui's production browser.

### Linux input method

Use an isolated session bus and Xvfb. The fixture needs the installed Chromium, IBus with its GTK 3 module, and Python with the IBus GI bindings.

```sh
. /home/m/.config/remote-gui/runtime.env
export PATH="$(dirname "$REMOTE_GUI_XVFB"):$PATH"
probe=$(mktemp -d)
dbus-run-session -- xvfb-run -a -s '-screen 0 960x720x24 -nolisten tcp' \
  bash tests/remote-gui/mobile-feasibility/native-ime/run.sh "$probe"
```

The engine sends a fixed synthetic edit over its private IBus instance. The page reports booleans and event targets for its own two fields. Context identifiers are reduced to local test numbers. On Chromium 156, expect the control edit in A, the same input context after switching to B, and exit 1 with `F1: native IBus commit reached B in the same context after A lost focus`. A setup failure does not establish that result.
