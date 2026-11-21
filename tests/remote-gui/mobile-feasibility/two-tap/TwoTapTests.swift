import Foundation
import XCTest

final class KeyboardOpeningTests: XCTestCase {
    @MainActor
    func testTwoTapsOpenNativeKeyboardAndType() async throws {
        continueAfterFailure = false
        let url = try XCTUnwrap(ProcessInfo.processInfo.environment["RG_FIXTURE_URL"].flatMap(URL.init(string:)))
        let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        safari.open(url)
        XCTAssertTrue(safari.staticTexts["Live viewer ready"].waitForExistence(timeout: 20))
        let canvas = safari.images["Synthetic live remote canvas"]
        XCTAssertTrue(canvas.waitForExistence(timeout: 5))
        let keyboard = safari.keyboards.firstMatch
        let prompt = safari.buttons["Tap to type"]
        XCTAssertFalse(keyboard.exists)
        canvas.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.88)).tap()
        XCTAssertTrue(safari.staticTexts["Plain area tapped"].waitForExistence(timeout: 5))
        XCTAssertFalse(prompt.exists)
        XCTAssertFalse(keyboard.exists)
        canvas.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 165.0 / 720.0)).tap()
        XCTAssertTrue(prompt.waitForExistence(timeout: 5))
        XCTAssertFalse(keyboard.waitForExistence(timeout: 1))
        prompt.tap()
        XCTAssertTrue(keyboard.waitForExistence(timeout: 5))
        safari.typeText("z")
        for _ in 0..<30 {
            let (data, response) = try await URLSession.shared.data(from: url.appendingPathComponent("state"))
            XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
            let state = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
            if let result = state["editResult"] as? [String: Any] {
                XCTAssertEqual(result["exactA"] as? Bool, true)
                XCTAssertEqual(result["emptyB"] as? Bool, true)
                XCTAssertEqual(result["deliveredA"] as? Int, 1)
                return
            }
            try await Task.sleep(for: .milliseconds(120))
        }
        XCTFail("The synthetic field did not receive the native edit")
    }
}
