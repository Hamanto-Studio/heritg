import SwiftUI
import UIKit

struct ExportSettingsView: View {
    let tree: FamilyTree
    let people: [Person]
    let relationships: [FamilyRelationship]
    let generationLimits: TreeGenerationLimits

    @Environment(\.locale) private var locale
    @State private var exportURL: URL?
    @State private var svgURL: URL?
    @State private var gedcomURL: URL?
    @State private var archiveURL: URL?
    @State private var exportError: String?
    @State private var exportPointOfViewID: String?
    @State private var archivePassword = ""
    @State private var archivePasswordConfirmation = ""
    @State private var isPreparingArchive = false

    private var archivePasswordCharacterCount: Int {
        archivePassword.precomposedStringWithCanonicalMapping.unicodeScalars.count
    }

    init(
        tree: FamilyTree,
        people: [Person],
        relationships: [FamilyRelationship],
        selectedPersonID: String?,
        generationLimits: TreeGenerationLimits
    ) {
        self.tree = tree
        self.people = people
        self.relationships = relationships
        self.generationLimits = generationLimits
        _exportPointOfViewID = State(initialValue: selectedPersonID)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Export your family tree")
                        .font(.title3.bold())
                    Text("Choose how the tree should be presented, then share an image or family-data file.")
                        .foregroundStyle(HeritgColor.subtleText)
                        .fixedSize(horizontal: false, vertical: true)
                }

                VStack(alignment: .leading, spacing: 10) {
                    Label("Tree image point of view", systemImage: "person.crop.circle")
                        .font(.headline)

                    Picker("Point of view", selection: $exportPointOfViewID) {
                        Text("Names only").tag(nil as String?)
                        ForEach(people.sorted(by: { $0.displayName < $1.displayName })) { person in
                            Text(person.displayName).tag(Optional(person.id))
                        }
                    }
                    .pickerStyle(.menu)
                    .accessibilityIdentifier("settings.exportPointOfView")
                }
                .padding(16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(HeritgColor.base)
                .clipShape(.rect(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(HeritgColor.line))

                exportActions

                backupSection

                if let exportError {
                    Text(exportError)
                        .font(.footnote)
                        .foregroundStyle(HeritgColor.danger)
                        .accessibilityIdentifier("settings.exportError")
                }
            }
            .padding(20)
        }
        .background(HeritgColor.canvas)
        .navigationTitle("Export")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: "\(exportPointOfViewID ?? "names")-\(locale.identifier)") {
            prepareExport()
        }
    }

    private var backupSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Heritg backup", systemImage: "doc.badge.gearshape")
                .font(.headline)
            Text("Preserves all family data and photos in one file.")
                .font(.subheadline)
                .foregroundStyle(HeritgColor.subtleText)
                .fixedSize(horizontal: false, vertical: true)

            Label("Every Heritg backup is encrypted", systemImage: "lock.fill")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(HeritgColor.add)

            Text("The password is optional. Leave both fields empty to restore without a password, or use at least 15 characters to keep the file private.")
                .font(.footnote)
                .foregroundStyle(HeritgColor.subtleText)
                .fixedSize(horizontal: false, vertical: true)
            SecureField("Password (optional)", text: $archivePassword)
                .textContentType(.newPassword)
                .disabled(isPreparingArchive)
                .accessibilityIdentifier("settings.archivePassword")
            SecureField("Confirm password", text: $archivePasswordConfirmation)
                .textContentType(.newPassword)
                .disabled(isPreparingArchive)
                .accessibilityIdentifier("settings.archivePasswordConfirmation")

            if !archivePasswordConfirmation.isEmpty,
               archivePassword != archivePasswordConfirmation {
                Text("Passwords do not match.")
                    .font(.footnote)
                    .foregroundStyle(HeritgColor.danger)
            }

            if !archivePassword.isEmpty, archivePasswordCharacterCount < 15 {
                Text("Use at least 15 characters.")
                    .font(.footnote)
                    .foregroundStyle(HeritgColor.danger)
            }

            Button {
                prepareArchive()
            } label: {
                Label(
                    isPreparingArchive ? "Creating backup" : "Create Heritg backup",
                    systemImage: isPreparingArchive ? "hourglass" : "lock"
                )
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(HeritgButtonStyle(variant: .secondary))
            .disabled(
                isPreparingArchive || archivePassword != archivePasswordConfirmation ||
                    (!archivePassword.isEmpty && archivePasswordCharacterCount < 15)
            )
            .accessibilityIdentifier("settings.exportHeritg")

            if let archiveURL {
                ShareLink(item: archiveURL) {
                    Label("Share Heritg backup", systemImage: "square.and.arrow.up")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(HeritgButtonStyle(variant: .primary))
                .accessibilityHint("Opens the system share sheet")
                .accessibilityIdentifier("settings.shareHeritg")
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(HeritgColor.base)
        .clipShape(.rect(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(HeritgColor.line))
        .onChange(of: archivePassword) { _, password in
            if !password.isEmpty { archiveURL = nil }
        }
        .onChange(of: archivePasswordConfirmation) { _, password in
            if !password.isEmpty { archiveURL = nil }
        }
    }

    @ViewBuilder
    private var exportActions: some View {
        if let gedcomURL, let exportURL, let svgURL {
            ShareLink(item: exportURL) {
                Label("Export tree image (PNG)", systemImage: "photo")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(HeritgButtonStyle(variant: .primary))
            .accessibilityLabel("Export family tree as PNG")
            .accessibilityHint("Opens the system share sheet")
            .accessibilityIdentifier("settings.exportPNG")

            ShareLink(item: svgURL) {
                Label("Export scalable tree (SVG)", systemImage: "doc.richtext")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(HeritgButtonStyle(variant: .secondary))
            .accessibilityLabel("Export family tree as SVG")
            .accessibilityHint("Opens the system share sheet")
            .accessibilityIdentifier("settings.exportSVG")

            ShareLink(item: gedcomURL) {
                Label("Export GEDCOM 7", systemImage: "arrow.up.doc")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(HeritgButtonStyle(variant: .secondary))
            .accessibilityLabel("Export family data as GEDCOM 7")
            .accessibilityHint("Opens the system share sheet")
            .accessibilityIdentifier("settings.exportGEDCOM")
        } else {
            Button("Preparing exports", systemImage: "hourglass") { }
                .frame(maxWidth: .infinity)
                .buttonStyle(HeritgButtonStyle(variant: .secondary))
                .disabled(true)
                .accessibilityIdentifier("settings.exportPreparing")
        }
    }

    private func prepareExport() {
        exportURL = nil
        svgURL = nil
        gedcomURL = nil
        exportError = nil

        do {
            let layout = exportLayout
            let exportedAt = Date.now
            let gedcom = GEDCOMExporter.export(people: people, relationships: relationships)
            let gedcomURL = URL.temporaryDirectory.appending(path: "\(exportBaseName).ged")
            try Data(gedcom.utf8).write(to: gedcomURL, options: .atomic)
            self.gedcomURL = gedcomURL

            let svg = TreeSVGExporter.data(
                layout: layout,
                showsRelationshipLabels: exportPointOfViewID != nil,
                exportedAt: exportedAt,
                locale: locale
            )
            let svgURL = URL.temporaryDirectory.appending(path: "\(exportBaseName)-Chart.svg")
            try svg.write(to: svgURL, options: .atomic)
            self.svgURL = svgURL

            let rasterSize = TreeRasterExportSize(
                layout: layout,
                showsRelationshipLabels: exportPointOfViewID != nil
            )
            let exportView = TreeExportView(
                layout: layout,
                showsRelationshipLabels: exportPointOfViewID != nil,
                exportedAt: exportedAt,
                footerHeight: rasterSize.footerHeight
            )
            .environment(\.locale, locale)
            .frame(width: rasterSize.size.width, height: rasterSize.size.height)
            let renderer = ImageRenderer(content: exportView)
            renderer.scale = 1

            guard let image = renderer.uiImage, let data = image.pngData() else {
                throw ExportError.renderFailed
            }

            let url = URL.temporaryDirectory.appending(path: "\(exportBaseName)-Chart.png")
            try data.write(to: url, options: .atomic)
            exportURL = url
        } catch {
            exportURL = nil
            svgURL = nil
            gedcomURL = nil
            exportError = error.localizedDescription
        }
    }

    private func prepareArchive() {
        archiveURL = nil
        exportError = nil
        guard archivePassword == archivePasswordConfirmation else {
            exportError = String(localized: "Passwords do not match.", locale: AppLanguage.selectedLocale)
            return
        }
        guard archivePassword.isEmpty || archivePasswordCharacterCount >= 15 else {
            exportError = String(localized: "Use at least 15 characters.", locale: AppLanguage.selectedLocale)
            return
        }

        do {
            let payload = try HeritgArchive.payload(
                tree: tree,
                people: people,
                relationships: relationships
            )
            let password = archivePassword
            isPreparingArchive = true
            Task {
                defer { isPreparingArchive = false }
                do {
                    let data = try await Task.detached(priority: .userInitiated) {
                        try HeritgArchive.makeArchive(payload, password: password)
                    }.value
                    let url = URL.temporaryDirectory.appending(path: "\(exportBaseName).heritg")
                    try data.write(to: url, options: [.atomic, .completeFileProtection])
                    archivePassword = ""
                    archivePasswordConfirmation = ""
                    archiveURL = url
                } catch {
                    exportError = error.localizedDescription
                }
            }
        } catch {
            exportError = error.localizedDescription
        }
    }

    private var exportBaseName: String {
        let cleanTitle = tree.title
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }
            .joined(separator: "-")
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return "\(cleanTitle.isEmpty ? "Heritg-Family-Tree" : cleanTitle)-\(formatter.string(from: .now))"
    }

    private var exportLayout: TreeLayoutResult {
        TreeLayout.make(
            focusedPersonID: nil,
            people: people.map(\.treeSnapshot),
            relationships: relationships.map(\.treeSnapshot),
            selectedPersonID: exportPointOfViewID,
            generationLimits: generationLimits
        )
    }
}

private enum ExportError: LocalizedError {
    case renderFailed

    var errorDescription: String? {
        String(
            localized: "The family tree image could not be created.",
            locale: AppLanguage.selectedLocale
        )
    }
}
