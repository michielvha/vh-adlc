import Foundation
import XCTest

final class KeyboardOpeningTests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testSelectiveFirstTapOpensNativeKeyboard() throws {
        let fixtureURL = try XCTUnwrap(
            ProcessInfo.processInfo.environment["RG_FIXTURE_URL"].flatMap(URL.init(string:)),
            "Set RG_FIXTURE_URL to the private synthetic gesture fixture."
        )
        XCTAssertEqual(fixtureURL.scheme, "https")

        let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        safari.open(fixtureURL)

        let ready = safari.staticTexts["Gesture probe ready"]
        XCTAssertTrue(ready.waitForExistence(timeout: 15))
        let surface = safari.images["Synthetic gesture surface"]
        XCTAssertTrue(surface.waitForExistence(timeout: 5))
        let keyboard = safari.keyboards.firstMatch
        XCTAssertFalse(keyboard.exists, "The OS keyboard must begin closed.")

        surface.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.75)).tap()
        XCTAssertTrue(safari.staticTexts["Plain area tapped"].waitForExistence(timeout: 3))
        XCTAssertFalse(keyboard.waitForExistence(timeout: 1), "A plain area opened the OS keyboard.")

        surface.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.25)).tap()
        XCTAssertTrue(safari.staticTexts["Editable area tapped"].waitForExistence(timeout: 3))
        XCTAssertTrue(keyboard.waitForExistence(timeout: 5), "The first recognized tap did not open the native iOS keyboard.")
    }
}
