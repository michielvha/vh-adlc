# Live stream with a cooperating editor

This probe exercises a disposable Chromium page over stock noVNC, x11vnc and websockify. The page cooperates with the test to supply field geometry, edited target and focus epoch. Its only accepted text is the fixture marker `z`. It can move focus just before applying an edit so the test can check that the other field stays empty.

Copy this directory to a new private directory and load the installed GUI tool paths. Start `node host.cjs` inside an owned Xvfb display using `xvfb-run -a -s '-screen 0 960x720x24 -nolisten tcp'`. The host writes its loopback `port` and owned `pid` in that directory. Set `REMOTE_GUI_PLAYWRIGHT_MODULE` and run `node smoke.cjs http://127.0.0.1:<port>/` against that instance. Stop the owned host after the run. Start a fresh host per run to reset the fields.

For Android, relay the host's loopback port to a loopback listener on the ADB host. Use a temporary `adb reverse` mapping from the authorized phone to that port. Run `android-e2e.py PHONE_FIXTURE_URL HOST_FIXTURE_URL` with the same ADB settings as the [keyboard gesture fixture](../keyboard-gesture/README.md). The script drives only the synthetic Chrome page on the selected phone and types only the fixture marker. Remove the owned reverse mapping and relay when the test ends.

For iOS, copy `LiveStreamTests.swift` into the disposable XcodeGen test project described in the [keyboard gesture fixture](../keyboard-gesture/README.md) as its sole UI test source. Build the same scheme. Set the fixture URL to a verified private HTTPS share that forwards the WebSocket.

The fixture does not enforce a production viewer authorization policy. Use only local, owned synthetic transports or a verified owner-restricted test share. A pass covers the cooperating web page only. It cannot establish arbitrary-site editing, native browser UI editing, or controller transfer.
