//
//  HeritgApp.swift
//  Heritg
//
//  Created by Hamanto Studio on 28/07/26.
//

import SwiftUI
import SwiftData

enum AppLanguage: String, CaseIterable, Identifiable {
    case english = "en"
    case indonesian = "id"

    var id: String { rawValue }
    var locale: Locale { Locale(identifier: rawValue) }
    var displayName: String {
        self == .english ? "English" : "Bahasa Indonesia"
    }

    static var selectedLocale: Locale {
        selectedLanguage.locale
    }

    static var selectedBundle: Bundle {
        guard let path = Bundle.main.path(forResource: selectedLanguage.rawValue, ofType: "lproj"),
              let bundle = Bundle(path: path) else { return .main }
        return bundle
    }

    static func localized(_ value: String.LocalizationValue) -> String {
        String(localized: value, bundle: selectedBundle, locale: selectedLocale)
    }

    private static var selectedLanguage: AppLanguage {
        let languageCode = UserDefaults.standard.string(forKey: "appLanguage") ?? deviceDefault.rawValue
        return AppLanguage(rawValue: languageCode) ?? .english
    }

    static var deviceDefault: AppLanguage {
        Locale.current.language.languageCode?.identifier == "id" ? .indonesian : .english
    }
}

@main
struct HeritgApp: App {
    @AppStorage("appLanguage") private var languageCode = AppLanguage.deviceDefault.rawValue

    var sharedModelContainer: ModelContainer = {
        let schema = Schema([
            FamilyTree.self,
            Person.self,
            FamilyRelationship.self,
        ])
        let modelConfiguration = ModelConfiguration(
            schema: schema,
            isStoredInMemoryOnly: ProcessInfo.processInfo.arguments.contains("-ui_testing"),
            cloudKitDatabase: .none
        )

        do {
            return try ModelContainer(for: schema, configurations: [modelConfiguration])
        } catch {
            fatalError("Could not create ModelContainer: \(error)")
        }
    }()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .tint(HeritgColor.brand)
                .environment(
                    \.locale,
                    AppLanguage(rawValue: languageCode)?.locale ?? AppLanguage.english.locale
                )
        }
        .modelContainer(sharedModelContainer)
    }
}
