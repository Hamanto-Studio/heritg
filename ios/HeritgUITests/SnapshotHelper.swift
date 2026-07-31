import Foundation
import XCTest

@MainActor
func setupSnapshot(_ app: XCUIApplication) {
    Snapshot.app = app
    if let cacheDirectory = Snapshot.cacheDirectory {
        if let language = try? String(
            contentsOf: cacheDirectory.appendingPathComponent("language.txt"),
            encoding: .utf8
        ).trimmingCharacters(in: .whitespacesAndNewlines) {
            app.launchArguments += ["-AppleLanguages", "(\(language))"]
            app.launchArguments += ["-appLanguage", language.hasPrefix("id") ? "id" : "en"]
        }

        if let locale = try? String(
            contentsOf: cacheDirectory.appendingPathComponent("locale.txt"),
            encoding: .utf8
        ).trimmingCharacters(in: .whitespacesAndNewlines) {
            app.launchArguments += ["-AppleLocale", locale]
        }
    }

    app.launchArguments += ["-FASTLANE_SNAPSHOT", "YES", "-ui_testing"]
}

@MainActor
func snapshot(_ name: String) {
    Snapshot.capture(name)
}

@MainActor
private enum Snapshot {
    static var app: XCUIApplication?

    static var cacheDirectory: URL? {
        guard let home = ProcessInfo.processInfo.environment["SIMULATOR_HOST_HOME"] else {
            return nil
        }
        return URL(fileURLWithPath: home)
            .appendingPathComponent("Library/Caches/tools.fastlane", isDirectory: true)
    }

    static func capture(_ name: String) {
        guard app != nil,
              let directory = cacheDirectory?.appendingPathComponent("screenshots", isDirectory: true),
              var device = ProcessInfo.processInfo.environment["SIMULATOR_DEVICE_NAME"] else {
            XCTFail("Fastlane Snapshot environment is unavailable")
            return
        }

        sleep(1)
        device = device.replacingOccurrences(
            of: "Clone [0-9]+ of ",
            with: "",
            options: .regularExpression
        )
        let destination = directory.appendingPathComponent("\(device)-\(name).png")

        do {
            try FileManager.default.createDirectory(
                at: directory,
                withIntermediateDirectories: true
            )
            try XCUIScreen.main.screenshot().pngRepresentation.write(to: destination, options: .atomic)
            NSLog("snapshot: \(name)")
        } catch {
            XCTFail("Could not save snapshot \(name): \(error.localizedDescription)")
        }
    }
}

// SnapshotHelperVersion [1.30]
