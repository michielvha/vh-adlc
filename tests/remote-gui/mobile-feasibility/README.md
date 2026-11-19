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
