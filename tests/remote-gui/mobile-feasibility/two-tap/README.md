# Two-tap native keyboard feasibility

This disposable fixture uses stock Chromium on Xvfb, a private AT-SPI bus, x11vnc, websockify and the installed noVNC modules. The synthetic page reports its own edit-event counts and boolean comparisons against the marker `z`. It does not tell the viewer which field is focused. The viewer asks the private helper for the verified Chromium publisher's focused state and geometry. The helper only sees synthetic test controls.

Run on the configured Fedora host with its existing GUI tools and Python D-Bus/AT-SPI bindings.

```sh
. /home/m/.config/remote-gui/runtime.env
export PATH="$(dirname "$REMOTE_GUI_XVFB"):$PATH"
probe=$(mktemp -d)
cp tests/remote-gui/mobile-feasibility/two-tap/{host.cjs,viewer.html,viewer.js,input.html,focused.py,start.sh} "$probe/"
dbus-run-session -- xvfb-run -a -s '-screen 0 960x720x24 -nolisten tcp' bash "$probe/start.sh" "$probe"
```

The fixture writes its loopback port and owned process ID to the new directory. Use only localhost or a verified temporary owner-only share. The iPhone runner uses the disposable Xcode project documented in the [earlier fixture](../keyboard-gesture/README.md). Use `TwoTapTests.swift` as that project's sole UI test source and pass the verified HTTPS fixture URL in `RG_FIXTURE_URL`. The test checks the OS keyboard and one synthetic remote edit. The fixture starts with empty fields for each device. Stop the owned fixture and its share after the run.

This specimen checks current focus and bounds. The product design adds reported-focus association, geometry and freshness checks. The keyboard proof covers the specimen and does not certify the packaged plugin.
