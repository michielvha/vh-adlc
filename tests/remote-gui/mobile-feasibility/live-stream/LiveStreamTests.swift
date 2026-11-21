import Foundation
import XCTest

private struct ProbeState: Decodable {
    struct Box: Decodable {
        let x: Double
        let y: Double
        let width: Double
        let height: Double
    }
    struct Geometry: Decodable {
        let width: Double
        let height: Double
        let fields: [String: Box]
    }
    struct Result: Decodable, Equatable {
        let status: String
        let exactA: Bool
        let emptyB: Bool
        let deliveredA: Int
        let deliveredB: Int
    }
    let geometry: Geometry
    let editResult: Result?
}

final class KeyboardOpeningTests: XCTestCase {
    @MainActor
    func testNativeKeyboardAndBoundRemoteEdit() async throws {
        continueAfterFailure = false
        let url = try XCTUnwrap(ProcessInfo.processInfo.environment["RG_FIXTURE_URL"].flatMap(URL.init(string:)))
        XCTAssertEqual(url.scheme, "https")
        func state() async throws -> ProbeState {
            let (data, response) = try await URLSession.shared.data(from: url.appendingPathComponent("state"))
            XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
            return try JSONDecoder().decode(ProbeState.self, from: data)
        }
        let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        safari.open(url)
        XCTAssertTrue(safari.staticTexts["Live viewer ready"].waitForExistence(timeout:15))
        let canvas = safari.images["Synthetic live remote canvas"]
        XCTAssertTrue(canvas.waitForExistence(timeout:5))
        let keyboard = safari.keyboards.firstMatch
        XCTAssertFalse(keyboard.exists)
        canvas.coordinate(withNormalizedOffset: CGVector(dx:0.5,dy:0.88)).tap()
        XCTAssertTrue(safari.staticTexts["Plain area tapped"].waitForExistence(timeout:3))
        XCTAssertFalse(keyboard.waitForExistence(timeout:1))
        let geometry = try await state().geometry
        let a = try XCTUnwrap(geometry.fields["a"])
        let point = CGVector(dx:(a.x+a.width/2)/geometry.width,dy:(a.y+a.height/2)/geometry.height)
        canvas.coordinate(withNormalizedOffset:point).tap()
        XCTAssertTrue(keyboard.waitForExistence(timeout:5))
        XCTAssertTrue(safari.staticTexts["Remote field A focused"].waitForExistence(timeout:4))
        safari.typeText("z")
        XCTAssertTrue(safari.staticTexts["Remote edit applied"].waitForExistence(timeout:4))
        let afterEdit = try await state().editResult
        XCTAssertEqual(afterEdit, ProbeState.Result(status:"applied",exactA:true,emptyB:true,deliveredA:1,deliveredB:0))
        var race = URLRequest(url:url.appendingPathComponent("arm"))
        race.httpMethod = "POST"
        race.httpBody = Data("{}".utf8)
        let (_, armed) = try await URLSession.shared.data(for:race)
        XCTAssertEqual((armed as? HTTPURLResponse)?.statusCode,200)
        safari.typeText("z")
        XCTAssertTrue(safari.staticTexts["Remote edit cancelled"].waitForExistence(timeout:4))
        let afterRace = try await state().editResult
        XCTAssertEqual(afterRace, ProbeState.Result(status:"cancelled",exactA:true,emptyB:true,deliveredA:1,deliveredB:0))
    }
}
