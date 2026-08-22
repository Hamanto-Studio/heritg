import SwiftUI
import UIKit

struct ShareSettingsView: View {
    let tree: FamilyTree
    let people: [Person]
    let relationships: [FamilyRelationship]
    let generationLimits: TreeGenerationLimits

    @Environment(\.locale) private var locale
    @State private var selectedMethod = ShareMethod.heritg
    @State private var shareError: String?
    @State private var preparingFormat: ShareFormat?
    @State private var sharedFile: SharedFile?
    @State private var preparationTask: Task<Void, Never>?
    @State private var exportPointOfViewID: String?
    @State private var archivePassword = ""
    @State private var archivePasswordConfirmation = ""

    private var archivePasswordMeetsRequirements: Bool {
        ArchivePasswordPolicy.accepts(archivePassword)
    }

    private var archivePasswordRequirements: ArchivePasswordPolicy.Requirements {
        ArchivePasswordPolicy.requirements(for: archivePassword)
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
                    Text("Share family tree")
                        .font(.title3.bold())
                    Text(verbatim: tree.title)
                        .font(.headline)
                    Text("\(people.count) people in this tree")
                        .foregroundStyle(HeritgColor.subtleText)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Text("What would you like to send?")
                    .font(.headline)
                methodPicker
                selectedMethodContent

                if let shareError {
                    Text(shareError)
                        .font(.footnote)
                        .foregroundStyle(HeritgColor.danger)
                        .accessibilityIdentifier("settings.shareError")
                }
            }
            .padding(20)
        }
        .background(HeritgColor.canvas)
        .navigationTitle("Share")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $sharedFile) { item in
            SystemShareSheet(url: item.url)
        }
        .onDisappear {
            preparationTask?.cancel()
        }
    }

    private var methodPicker: some View {
        VStack(spacing: 10) {
            ForEach(ShareMethod.allCases) { method in
                Button {
                    selectedMethod = method
                    shareError = nil
                } label: {
                    HStack(spacing: 14) {
                        Image(systemName: method.systemImage)
                            .font(.title3)
                            .foregroundStyle(HeritgColor.brand)
                            .frame(width: 34)

                        VStack(alignment: .leading, spacing: 3) {
                            Text(method.title)
                                .font(.headline)
                                .foregroundStyle(HeritgColor.text)
                            Text(method.detail)
                                .font(.footnote)
                                .foregroundStyle(HeritgColor.subtleText)
                                .multilineTextAlignment(.leading)
                        }
                        Spacer()
                        if selectedMethod == method {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundStyle(HeritgColor.add)
                        }
                    }
                    .padding(16)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(selectedMethod == method ? HeritgColor.recessed : HeritgColor.base)
                    .clipShape(.rect(cornerRadius: 14))
                    .overlay(RoundedRectangle(cornerRadius: 14).stroke(HeritgColor.line))
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(preparingFormat != nil)
                .accessibilityAddTraits(selectedMethod == method ? .isSelected : [])
                .accessibilityIdentifier("settings.shareMethod.\(method.rawValue)")
            }
        }
    }

    @ViewBuilder
    private var selectedMethodContent: some View {
        switch selectedMethod {
        case .heritg:
            backupSection
        case .gedcom:
            gedcomSection
        case .images:
            imagesSection
        }
    }

    private var backupSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("HERITG backup (.heritg)", systemImage: "doc.badge.gearshape")
                .font(.headline)
            Text("Best for backing up your tree or moving it between HERITG devices. Preserves the complete tree, including photos, notes, places, dates, and relationship details.")
                .font(.subheadline)
                .foregroundStyle(HeritgColor.subtleText)
                .fixedSize(horizontal: false, vertical: true)

            Label("Every Heritg backup is encrypted", systemImage: "lock.fill")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(HeritgColor.add)

            Text("The password is optional. Leave it empty to restore without a password. If you add one, complete the requirements below. Longer is safer.")
                .font(.footnote)
                .foregroundStyle(HeritgColor.subtleText)
                .fixedSize(horizontal: false, vertical: true)
            SecureField("Password (optional)", text: $archivePassword)
                .textContentType(.newPassword)
                .disabled(preparingFormat != nil)
                .accessibilityIdentifier("settings.archivePassword")

            if !archivePassword.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    passwordRequirement("At least 8 characters", isMet: archivePasswordRequirements.minimumLength)
                    passwordRequirement("Lowercase letter", isMet: archivePasswordRequirements.lowercase)
                    passwordRequirement("Uppercase letter", isMet: archivePasswordRequirements.uppercase)
                    passwordRequirement("Number", isMet: archivePasswordRequirements.number)
                    passwordRequirement("Special character", isMet: archivePasswordRequirements.special)
                }

                SecureField("Confirm password", text: $archivePasswordConfirmation)
                    .textContentType(.newPassword)
                    .disabled(preparingFormat != nil)
                    .accessibilityIdentifier("settings.archivePasswordConfirmation")

                if !archivePasswordConfirmation.isEmpty,
                   archivePassword != archivePasswordConfirmation {
                    Text("Passwords do not match.")
                        .font(.footnote)
                        .foregroundStyle(HeritgColor.danger)
                }
            }

            Button {
                prepareShare(.heritg)
            } label: {
                Label(
                    preparingFormat == .heritg ? "Preparing HERITG backup..." : "Share HERITG backup",
                    systemImage: preparingFormat == .heritg ? "hourglass" : "square.and.arrow.up"
                )
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(HeritgButtonStyle(variant: .primary))
            .disabled(
                preparingFormat != nil || archivePassword != archivePasswordConfirmation ||
                    !archivePasswordMeetsRequirements
            )
            .accessibilityHint("Opens the system share sheet")
            .accessibilityIdentifier("settings.shareHeritg")
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(HeritgColor.base)
        .clipShape(.rect(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(HeritgColor.line))
        .onChange(of: archivePassword) { password in
            if password.isEmpty {
                archivePasswordConfirmation = ""
            }
        }
    }

    private var gedcomSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("GEDCOM file (.ged)", systemImage: "doc.text")
                .font(.headline)
            Text("Best for moving family data into another genealogy app. GEDCOM includes people, key dates, relationships, and notes, but not photos or every HERITG-specific detail.")
                .font(.subheadline)
                .foregroundStyle(HeritgColor.subtleText)
                .fixedSize(horizontal: false, vertical: true)
            Text("This is a readable, unencrypted file after it leaves HERITG.")
                .font(.footnote)
                .foregroundStyle(HeritgColor.subtleText)

            Button {
                prepareShare(.gedcom)
            } label: {
                Label(
                    preparingFormat == .gedcom ? "Preparing GEDCOM..." : "Share GEDCOM",
                    systemImage: preparingFormat == .gedcom ? "hourglass" : "square.and.arrow.up"
                )
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(HeritgButtonStyle(variant: .primary))
            .disabled(preparingFormat != nil)
            .accessibilityHint("Opens the system share sheet")
            .accessibilityIdentifier("settings.shareGEDCOM")
        }
        .shareCardStyle()
    }

    private var imagesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Family tree images", systemImage: "photo.on.rectangle")
                .font(.headline)
            Text("Readable, unencrypted images. Use PNG for sharing and SVG for printing or editing.")
                .font(.subheadline)
                .foregroundStyle(HeritgColor.subtleText)
                .fixedSize(horizontal: false, vertical: true)

            Picker("Point of view", selection: $exportPointOfViewID) {
                Text("Entire tree").tag(nil as String?)
                ForEach(people.sorted(by: { $0.displayName < $1.displayName })) { person in
                    Text(person.displayName).tag(Optional(person.id))
                }
            }
            .pickerStyle(.menu)
            .disabled(preparingFormat != nil)
            .accessibilityIdentifier("settings.sharePointOfView")

            Button {
                prepareShare(.png)
            } label: {
                Label(
                    preparingFormat == .png ? "Preparing PNG..." : "Share PNG",
                    systemImage: preparingFormat == .png ? "hourglass" : "square.and.arrow.up"
                )
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(HeritgButtonStyle(variant: .primary))
            .disabled(preparingFormat != nil || people.isEmpty)
            .accessibilityHint("Opens the system share sheet")
            .accessibilityIdentifier("settings.sharePNG")

            Button {
                prepareShare(.svg)
            } label: {
                Label(
                    preparingFormat == .svg ? "Preparing SVG..." : "Share SVG",
                    systemImage: preparingFormat == .svg ? "hourglass" : "square.and.arrow.up"
                )
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(HeritgButtonStyle(variant: .secondary))
            .disabled(preparingFormat != nil || people.isEmpty)
            .accessibilityHint("Opens the system share sheet")
            .accessibilityIdentifier("settings.shareSVG")
        }
        .shareCardStyle()
    }

    private func passwordRequirement(_ title: LocalizedStringKey, isMet: Bool) -> some View {
        Label(title, systemImage: isMet ? "checkmark.square.fill" : "square")
            .font(.footnote)
            .foregroundStyle(isMet ? HeritgColor.add : HeritgColor.subtleText)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text(title))
            .accessibilityValue(isMet ? "Met" : "Not met")
    }

    private func prepareShare(_ format: ShareFormat) {
        guard preparingFormat == nil else { return }
        shareError = nil
        sharedFile = nil

        switch format {
        case .heritg:
            prepareArchive()
        case .gedcom:
            prepareGEDCOM()
        case .png, .svg:
            prepareImage(format)
        }
    }

    private func prepareArchive() {
        guard archivePassword == archivePasswordConfirmation else {
            shareError = String(localized: "Passwords do not match.", locale: AppLanguage.selectedLocale)
            return
        }
        guard archivePasswordMeetsRequirements else {
            shareError = String(localized: "Use at least 8 characters with an uppercase letter, a lowercase letter, a number, and a special character.", locale: AppLanguage.selectedLocale)
            return
        }

        do {
            let payload = try HeritgArchive.payload(
                tree: tree,
                people: people,
                relationships: relationships
            )
            let password = archivePassword
            let url = URL.temporaryDirectory.appending(path: "\(shareBaseName).heritg")
            preparingFormat = .heritg
            preparationTask = Task {
                do {
                    let data = try await Task.detached(priority: .userInitiated) {
                        try HeritgArchive.makeArchive(payload, password: password)
                    }.value
                    try Task.checkCancellation()
                    try data.write(to: url, options: [.atomic, .completeFileProtection])
                    archivePassword = ""
                    archivePasswordConfirmation = ""
                    finishPreparation(.heritg, url: url)
                } catch {
                    failPreparation(.heritg, error: error)
                }
            }
        } catch {
            shareError = error.localizedDescription
        }
    }

    private func prepareGEDCOM() {
        let url = URL.temporaryDirectory.appending(path: "\(shareBaseName).ged")
        preparingFormat = .gedcom
        preparationTask = Task {
            do {
                await Task.yield()
                try Task.checkCancellation()
                let data = Data(GEDCOMExporter.export(people: people, relationships: relationships).utf8)
                try data.write(to: url, options: .atomic)
                finishPreparation(.gedcom, url: url)
            } catch {
                failPreparation(.gedcom, error: error)
            }
        }
    }

    private func prepareImage(_ format: ShareFormat) {
        let peopleSnapshots = people.map(\.treeSnapshot)
        let relationshipSnapshots = relationships.map(\.treeSnapshot)
        let selectedPersonID = exportPointOfViewID
        let showsRelationshipLabels = selectedPersonID != nil
        let limits = generationLimits
        let exportedAt = Date.now
        let currentLocale = locale
        preparingFormat = format

        preparationTask = Task {
            do {
                let prepared = try await Task.detached(priority: .userInitiated) {
                    let layout = TreeLayout.make(
                        focusedPersonID: nil,
                        people: peopleSnapshots,
                        relationships: relationshipSnapshots,
                        selectedPersonID: selectedPersonID,
                        generationLimits: limits
                    )
                    try Task.checkCancellation()
                    let connectionPlan = TreeConnectionPlan.make(
                        from: layout,
                        showsRelationshipLabels: showsRelationshipLabels,
                        controlsVisible: false,
                        sourcePersonCount: layout.nodes.count
                    )
                    return PreparedShareImage(layout: layout, connectionPlan: connectionPlan)
                }.value
                try Task.checkCancellation()

                let url: URL
                if format == .svg {
                    let data = TreeSVGExporter.data(
                        layout: prepared.layout,
                        connectionPlan: prepared.connectionPlan,
                        showsRelationshipLabels: showsRelationshipLabels,
                        exportedAt: exportedAt,
                        locale: currentLocale
                    )
                    url = URL.temporaryDirectory.appending(path: "\(shareBaseName)-Chart.svg")
                    try data.write(to: url, options: .atomic)
                } else {
                    let rasterSize = TreeRasterExportSize(
                        layout: prepared.layout,
                        connectionPlan: prepared.connectionPlan
                    )
                    let exportView = TreeExportView(
                        layout: prepared.layout,
                        connectionPlan: prepared.connectionPlan,
                        showsRelationshipLabels: showsRelationshipLabels,
                        exportedAt: exportedAt,
                        footerHeight: rasterSize.footerHeight
                    )
                    .environment(\.locale, currentLocale)
                    .frame(width: rasterSize.size.width, height: rasterSize.size.height)
                    let renderer = ImageRenderer(content: exportView)
                    renderer.scale = 1

                    guard let image = renderer.uiImage, let data = image.pngData() else {
                        throw SharePreparationError.renderFailed
                    }
                    url = URL.temporaryDirectory.appending(path: "\(shareBaseName)-Chart.png")
                    try data.write(to: url, options: .atomic)
                }
                try Task.checkCancellation()
                finishPreparation(format, url: url)
            } catch {
                failPreparation(format, error: error)
            }
        }
    }

    private func finishPreparation(_ format: ShareFormat, url: URL) {
        guard preparingFormat == format else { return }
        preparingFormat = nil
        preparationTask = nil
        sharedFile = SharedFile(url: url)
    }

    private func failPreparation(_ format: ShareFormat, error: Error) {
        guard preparingFormat == format else { return }
        preparingFormat = nil
        preparationTask = nil
        if !(error is CancellationError) {
            shareError = error.localizedDescription
        }
    }

    private var shareBaseName: String {
        let cleanTitle = tree.title
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { !$0.isEmpty }
            .joined(separator: "-")
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return "\(cleanTitle.isEmpty ? "Heritg-Family-Tree" : cleanTitle)-\(formatter.string(from: .now))"
    }

}

private enum ShareMethod: String, CaseIterable, Identifiable {
    case heritg
    case gedcom
    case images

    var id: String { rawValue }

    var title: LocalizedStringKey {
        switch self {
        case .heritg: "HERITG backup"
        case .gedcom: "GEDCOM"
        case .images: "Images"
        }
    }

    var detail: LocalizedStringKey {
        switch self {
        case .heritg: "Recommended - Complete tree and photos"
        case .gedcom: "For other genealogy apps"
        case .images: "PNG or SVG"
        }
    }

    var systemImage: String {
        switch self {
        case .heritg: "externaldrive"
        case .gedcom: "doc.text"
        case .images: "photo.on.rectangle"
        }
    }
}

private enum ShareFormat: Equatable {
    case heritg
    case gedcom
    case png
    case svg
}

private struct PreparedShareImage: Sendable {
    let layout: TreeLayoutResult
    let connectionPlan: TreeConnectionPlan
}

private struct SharedFile: Identifiable {
    let id = UUID()
    let url: URL
}

private struct SystemShareSheet: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

private struct ShareCardStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(HeritgColor.base)
            .clipShape(.rect(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(HeritgColor.line))
    }
}

private extension View {
    func shareCardStyle() -> some View {
        modifier(ShareCardStyle())
    }
}

private enum SharePreparationError: LocalizedError {
    case renderFailed

    var errorDescription: String? {
        String(
            localized: "The family tree image could not be created.",
            locale: AppLanguage.selectedLocale
        )
    }
}
