# Native keyboard gesture probe

This fixture tests whether the stock noVNC one-tap event can focus a local editor synchronously in phone Safari. Its canvas has fixed synthetic regions. It exercises neither remote field discovery nor RFB input delivery.

Copy this directory to a disposable directory. Under `site/novnc/`, place the installed noVNC 1.5.0 `core/input/gesturehandler.js` at its matching path with `LICENSE.txt`. The gesture module used for the iPhone test had SHA-256 `1f5399d6b2db43d7ce7bf7a70d868597f79aeff4c4735f1d5472738e4dea78d7`. Serve `site/` on a private HTTPS URL reachable by the phone. Use synthetic data only.

On a Mac with Xcode, XcodeGen and a paired, awake iPhone, generate the project in the disposable directory with `cd ios && xcodegen generate`. Build for testing with scheme `RemoteGUIKeyboardProbe`, an authorized development team and the destination set to the physical phone. Run the generated `.xctestrun` with `test-without-building`, passing the private fixture URL as `TEST_RUNNER_RG_FIXTURE_URL` in the environment. Keep the `.xcresult` with the run evidence.

A pass requires the native keyboard to start closed, stay closed after a tap on the plain area, then appear after one tap on the editable area. The fixture includes no keyboard button. A desktop touch smoke test can establish focus behavior. Use the phone's operating system keyboard assertion for the native result.
