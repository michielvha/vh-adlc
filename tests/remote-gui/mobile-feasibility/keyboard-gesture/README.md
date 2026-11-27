# Native keyboard gesture probe

This fixture tests whether the stock noVNC one-tap event can focus a local editor synchronously in phone Safari and Chrome. Its canvas has fixed synthetic regions. It exercises neither remote field discovery nor RFB input delivery.

Copy this directory to a disposable directory. Under `site/novnc/`, place the installed noVNC 1.5.0 `core/input/gesturehandler.js` at its matching path with `LICENSE.txt`. The gesture module used for the iPhone test had SHA-256 `1f5399d6b2db43d7ce7bf7a70d868597f79aeff4c4735f1d5472738e4dea78d7`. Use synthetic data only.

For iPhone, serve `site/` on a private HTTPS URL reachable by the phone. On a Mac with Xcode, XcodeGen and a paired, awake iPhone, generate the project in the disposable directory with `cd ios && xcodegen generate`. Build for testing with scheme `RemoteGUIKeyboardProbe`, an authorized development team and the destination set to the physical phone. Run the generated `.xctestrun` with `test-without-building`, passing the private fixture URL as `TEST_RUNNER_RG_FIXTURE_URL` in the environment. Keep the `.xcresult` with the run evidence.

A pass requires the native keyboard to start closed, stay closed after a tap on the plain area, then appear after one tap on the editable area. The fixture includes no keyboard button. A desktop touch smoke test can establish focus behavior. Use the phone's operating system keyboard assertion for the native result.

On Android, use an authorized ADB connection to the physical phone. Run `python3 android/run-loopback.py` from the disposable copy with the same noVNC file in `site/novnc/`. Set `ANDROID_ADB` if the executable is outside PATH. When more than one ADB transport is connected, set `RG_ANDROID_SERIAL` to the selected phone's serial. The runner serves the fixture from the host loopback and removes its own temporary ADB reverse mapping after the run. It uses Chrome's accessibility bounds for the taps and Android's input-method service to check keyboard visibility. It does not collect a screenshot or enter text.
