import SwiftUI
import UIKit

struct SettingsSheet: View {
    let tree: FamilyTree
    let people: [Person]
    let relationships: [FamilyRelationship]
    let generationLimits: TreeGenerationLimits
    let selectedPersonID: String?

    @Environment(\.dismiss) private var dismiss
    @AppStorage("appLanguage") private var languageCode = AppLanguage.deviceDefault.rawValue

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
        self.selectedPersonID = selectedPersonID
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Private family trees, kept simple")
                            .font(.title3.bold())
                            .foregroundStyle(HeritgColor.text)

                        Text("Heritg helps you build and preserve your family tree privately. Your family data stays on this device in this first version.")
                            .font(.body)
                            .foregroundStyle(HeritgColor.subtleText)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    NavigationLink {
                        ExportSettingsView(
                            tree: tree,
                            people: people,
                            relationships: relationships,
                            selectedPersonID: selectedPersonID,
                            generationLimits: generationLimits
                        )
                    } label: {
                        settingsRow(
                            title: "Export",
                            subtitle: "Share a PNG or SVG image, or GEDCOM file",
                            systemImage: "square.and.arrow.up"
                        )
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("settings.export")

                    NavigationLink {
                        LanguageSettingsView(languageCode: $languageCode)
                    } label: {
                        settingsRow(
                            title: "Language",
                            subtitle: selectedLanguageName,
                            systemImage: "globe"
                        )
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("settings.language")

                    if let feedbackURL {
                        Link(destination: feedbackURL) {
                            settingsRow(
                                title: "Give feedback or report a bug",
                                subtitle: "Contact Hamanto Studio on Telegram",
                                systemImage: "paperplane"
                            )
                        }
                        .buttonStyle(.plain)
                        .accessibilityHint("Opens Telegram with app and device details")
                        .accessibilityIdentifier("settings.feedback")
                    }

                    Divider()

                    Text("Built with ❤️ by Hamanto Studio")
                        .font(.footnote)
                        .foregroundStyle(HeritgColor.subtleText)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .accessibilityIdentifier("settings.studioCredit")
                }
                .padding(20)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(HeritgColor.canvas)
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .accessibilityIdentifier("settings.close")
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private func settingsRow(
        title: LocalizedStringKey,
        subtitle: LocalizedStringKey,
        systemImage: String
    ) -> some View {
        HStack(spacing: 14) {
            Image(systemName: systemImage)
                .font(.title3)
                .foregroundStyle(HeritgColor.brand)
                .frame(width: 34)

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.headline)
                    .foregroundStyle(HeritgColor.text)
                Text(subtitle)
                    .font(.footnote)
                    .foregroundStyle(HeritgColor.subtleText)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(HeritgColor.subtleText)
        }
        .padding(16)
        .background(HeritgColor.base)
        .clipShape(.rect(cornerRadius: 14))
        .overlay(RoundedRectangle(cornerRadius: 14).stroke(HeritgColor.line))
    }

    private var selectedLanguageName: LocalizedStringKey {
        switch AppLanguage(rawValue: languageCode) ?? .english {
        case .english: "English"
        case .indonesian: "Bahasa Indonesia"
        }
    }

    private var feedbackURL: URL? {
        var components = URLComponents(string: "https://t.me/robihamanto")
        components?.queryItems = [URLQueryItem(name: "text", value: feedbackMessage)]
        return components?.url
    }

    private var feedbackMessage: String {
        let unknown = String(localized: "Unknown", locale: AppLanguage.selectedLocale)
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? unknown
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? unknown
        let device = UIDevice.current.model
        let systemVersion = UIDevice.current.systemVersion
        return String(localized: """
        Hi Hamanto Studio,

        I would like to share feedback or report a bug:

        [Please describe it here]

        App version: \(version)
        Build: \(build)
        Device: \(device)
        iOS version: \(systemVersion)
        """, locale: AppLanguage.selectedLocale, comment: "Prefilled Telegram feedback message with app version, build, device, and iOS version.")
    }
}

private struct LanguageSettingsView: View {
    @Binding var languageCode: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Choose the language used throughout Heritg.")
                    .foregroundStyle(HeritgColor.subtleText)
                    .fixedSize(horizontal: false, vertical: true)

                VStack(spacing: 0) {
                    ForEach(AppLanguage.allCases) { language in
                        Button {
                            languageCode = language.rawValue
                        } label: {
                            HStack(spacing: 14) {
                                Text(verbatim: language.displayName)
                                    .font(.body.weight(.medium))
                                    .foregroundStyle(HeritgColor.text)
                                Spacer()
                                if languageCode == language.rawValue {
                                    Image(systemName: "checkmark")
                                        .font(.body.weight(.semibold))
                                        .foregroundStyle(HeritgColor.brand)
                                }
                            }
                            .frame(minHeight: 52)
                            .padding(.horizontal, 16)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityAddTraits(languageCode == language.rawValue ? .isSelected : [])
                        .accessibilityIdentifier("settings.language.\(language.rawValue)")

                        if language != AppLanguage.allCases.last {
                            Divider().padding(.leading, 16)
                        }
                    }
                }
                .background(HeritgColor.base)
                .clipShape(.rect(cornerRadius: 14))
                .overlay(RoundedRectangle(cornerRadius: 14).stroke(HeritgColor.line))
            }
            .padding(20)
        }
        .background(HeritgColor.canvas)
        .navigationTitle("Language")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct TreeExportView: View {
    let layout: TreeLayoutResult
    let showsRelationshipLabels: Bool
    let exportedAt: Date
    let footerHeight: CGFloat

    init(
        layout: TreeLayoutResult,
        showsRelationshipLabels: Bool = true,
        exportedAt: Date = .now,
        footerHeight: CGFloat = TreeRasterExportSize.logicalFooterHeight
    ) {
        self.layout = layout
        self.showsRelationshipLabels = showsRelationshipLabels
        self.exportedAt = exportedAt
        self.footerHeight = footerHeight
    }

    var body: some View {
        VStack(spacing: 0) {
            GeometryReader { proxy in
                let connectionPlan = TreeConnectionPlan.make(
                    from: layout,
                    showsRelationshipLabels: showsRelationshipLabels
                )
                let transform = ExportTransform(
                    connectionPlan: connectionPlan,
                    nodes: layout.nodes,
                    size: proxy.size
                )

                ZStack {
                    Color.white

                    Canvas { context, _ in
                        for family in connectionPlan.families {
                            let path = TreeConnector.path(
                                for: family.segments,
                                transform: transform.point
                            )
                            context.stroke(
                                path,
                                with: .color(.gray.opacity(0.45)),
                                style: StrokeStyle(
                                    lineWidth: 1.5 * transform.scale,
                                    lineCap: .round,
                                    lineJoin: .round
                                )
                            )

                            for point in family.junctions {
                                let junction = transform.point(point)
                                let radius = 2 * transform.scale
                                context.fill(
                                    Path(ellipseIn: CGRect(
                                        x: junction.x - radius,
                                        y: junction.y - radius,
                                        width: radius * 2,
                                        height: radius * 2
                                    )),
                                    with: .color(.gray.opacity(0.45))
                                )
                            }
                        }

                        for edge in connectionPlan.nonParentEdges {
                            let path = TreeConnector.path(
                                kind: edge.kind,
                                from: transform.point(edge.from),
                                to: transform.point(edge.to),
                                avatarRadius: TreeVisualMetrics.avatarRadius * transform.scale
                            )
                            context.stroke(
                                path,
                                with: .color(.gray.opacity(0.45)),
                                style: StrokeStyle(
                                    lineWidth: 1.5 * transform.scale,
                                    lineCap: .round,
                                    lineJoin: .round
                                )
                            )
                        }


                        for point in connectionPlan.crossings {
                            let crossing = transform.point(point)
                            let gapRadius = 4 * transform.scale
                            context.fill(
                                Path(ellipseIn: CGRect(
                                    x: crossing.x - gapRadius,
                                    y: crossing.y - gapRadius,
                                    width: gapRadius * 2,
                                    height: gapRadius * 2
                                )),
                                with: .color(.white)
                            )
                            let bridge = Path { path in
                                path.move(to: CGPoint(x: crossing.x, y: crossing.y - 5 * transform.scale))
                                path.addLine(to: CGPoint(x: crossing.x, y: crossing.y + 5 * transform.scale))
                            }
                            context.stroke(
                                bridge,
                                with: .color(.gray.opacity(0.45)),
                                style: StrokeStyle(
                                    lineWidth: 1.5 * transform.scale,
                                    lineCap: .round
                                )
                            )
                        }
                    }

                    ForEach(layout.edges.filter { $0.marriageLabel != nil }) { edge in
                        exportMarriageLabel(edge, transform: transform)
                    }

                    ForEach(layout.nodes) { node in
                        exportNode(node, transform: transform)
                    }
                }
            }

            exportFooter
                .frame(height: footerHeight)
        }
        .background(Color.white)
    }

    private var exportFooter: some View {
        let scale = footerHeight / TreeRasterExportSize.logicalFooterHeight
        return VStack(alignment: .trailing, spacing: 2) {
            Text(verbatim: "© \(Calendar(identifier: .gregorian).component(.year, from: exportedAt)) Hamanto Studio™")
                .font(.system(size: 14 * scale, weight: .semibold))
            Text(exportedAt.formatted(
                .dateTime
                    .locale(AppLanguage.selectedLocale)
                    .day()
                    .month(.abbreviated)
                    .year()
            ))
                .font(.system(size: 11 * scale))
        }
        .foregroundStyle(Color.black.opacity(0.6))
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .trailing)
        .padding(.horizontal, 28 * scale)
    }

    private func exportMarriageLabel(_ edge: TreeEdgeLayout, transform: ExportTransform) -> some View {
        let midpoint = transform.point(CGPoint(
            x: (edge.from.x + edge.to.x) / 2,
            y: (edge.from.y + edge.to.y) / 2
        ))
        return Text(edge.marriageLabel ?? "")
            .font(.system(size: 12 * transform.scale, weight: .medium))
            .foregroundStyle(Color.gray)
            .padding(.horizontal, 7 * transform.scale)
            .padding(.vertical, 3 * transform.scale)
            .background(Color.white)
            .clipShape(Capsule())
            .position(midpoint)
    }

    private func exportNode(_ node: TreeNodeLayout, transform: ExportTransform) -> some View {
        let anchor = transform.point(node.position)
        let showsLifeSummary = node.person.lifeSummary != nil
        let labelHeight = TreeVisualMetrics.nodeLabelHeight(
            showsRelationship: showsRelationshipLabels,
            showsLifeSummary: showsLifeSummary
        ) * transform.scale

        return ZStack {
            Circle()
                .fill(Color.white)
                .frame(
                    width: TreeVisualMetrics.avatarDiameter * transform.scale,
                    height: TreeVisualMetrics.avatarDiameter * transform.scale
                )
                .overlay {
                    if let data = node.person.profilePhotoData,
                       let image = ProfilePhotoProcessor.preview(from: data) {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFill()
                            .frame(
                                width: (TreeVisualMetrics.avatarDiameter - 14) * transform.scale,
                                height: (TreeVisualMetrics.avatarDiameter - 14) * transform.scale
                            )
                            .clipShape(Circle())
                    } else {
                        Circle()
                            .fill(Color(red: 0.95, green: 0.96, blue: 0.97))
                            .padding(7 * transform.scale)
                            .overlay {
                                Text(node.person.name.prefix(1).uppercased())
                                    .font(.system(size: 24 * transform.scale).bold())
                                    .foregroundStyle(Color.black)
                            }
                    }
                }
                .overlay(Circle().stroke(Color.gray.opacity(0.35), lineWidth: 2))
                .position(anchor)

            VStack(spacing: 4) {
                Text(node.person.name)
                    .font(.system(size: 16 * transform.scale).bold())
                    .foregroundStyle(Color.black)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                if showsRelationshipLabels {
                    Text(node.role)
                        .font(.system(size: 13 * transform.scale))
                        .foregroundStyle(Color.gray)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
                if let lifeSummary = node.person.lifeSummary {
                    Text(lifeSummary)
                        .font(.system(size: 11 * transform.scale))
                        .foregroundStyle(Color.gray)
                        .lineLimit(1)
                }
            }
            .frame(
                width: TreeVisualMetrics.nodeLabelWidth * transform.scale,
                height: labelHeight,
                alignment: .top
            )
            .position(
                x: anchor.x,
                y: anchor.y + TreeVisualMetrics.nodeLabelCenterOffset(
                    showsRelationship: showsRelationshipLabels,
                    showsLifeSummary: showsLifeSummary
                ) * transform.scale
            )
        }
    }
}

private struct ExportTransform {
    let scale: CGFloat
    private let logicalCenter: CGPoint
    private let outputCenter: CGPoint

    init(connectionPlan: TreeConnectionPlan, nodes: [TreeNodeLayout], size: CGSize) {
        let bounds = connectionPlan.drawingBounds(including: nodes)
        scale = min(size.width / bounds.width, size.height / bounds.height)
        logicalCenter = CGPoint(x: bounds.midX, y: bounds.midY)
        outputCenter = CGPoint(x: size.width / 2, y: size.height / 2)
    }

    func point(_ logical: CGPoint) -> CGPoint {
        CGPoint(
            x: outputCenter.x + (logical.x - logicalCenter.x) * scale,
            y: outputCenter.y + (logical.y - logicalCenter.y) * scale
        )
    }
}
