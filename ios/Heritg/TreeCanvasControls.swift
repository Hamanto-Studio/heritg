import SwiftUI

struct TreeCanvasControls: View {
    @Binding var generationLimits: TreeGenerationLimits
    let availableGenerationLevels: TreeAvailableGenerationLevels
    let onShowTrees: () -> Void
    let onShowPeople: () -> Void
    let onShowSettings: () -> Void
    let onZoomIn: () -> Void
    let onZoomOut: () -> Void
    let onShowAll: () -> Void

    var body: some View {
        ZStack {
            Button(action: onShowTrees) {
                Image(systemName: "sidebar.left")
            }
                .buttonStyle(HeritgIconButtonStyle())
                .accessibilityLabel("Family Trees")
                .accessibilityHint("Opens your family tree library")
                .accessibilityIdentifier("tree.library")
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)

            HStack(spacing: 10) {
                Button("All people", systemImage: "person.2", action: onShowPeople)
                    .labelStyle(.iconOnly)
                    .buttonStyle(HeritgIconButtonStyle())
                    .accessibilityLabel("All people")
                    .accessibilityHint("Shows everyone in this family tree")
                    .accessibilityIdentifier("tree.people")

                Button("Settings", systemImage: "gearshape", action: onShowSettings)
                    .labelStyle(.iconOnly)
                    .buttonStyle(HeritgIconButtonStyle())
                    .accessibilityLabel("Settings")
                    .accessibilityIdentifier("tree.settings")
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)

            VStack(spacing: 10) {
                TreeGenerationLimitMenu(
                    limits: $generationLimits,
                    availableLevels: availableGenerationLevels
                )

                Button("Zoom in", systemImage: "plus.magnifyingglass", action: onZoomIn)
                    .labelStyle(.iconOnly)
                    .buttonStyle(HeritgIconButtonStyle())
                    .accessibilityLabel("Zoom in")
                    .accessibilityIdentifier("tree.zoomIn")

                Button("Zoom out", systemImage: "minus.magnifyingglass", action: onZoomOut)
                    .labelStyle(.iconOnly)
                    .buttonStyle(HeritgIconButtonStyle())
                    .accessibilityLabel("Zoom out")
                    .accessibilityIdentifier("tree.zoomOut")

                Button("Show all people", systemImage: "viewfinder", action: onShowAll)
                    .labelStyle(.iconOnly)
                    .buttonStyle(HeritgIconButtonStyle())
                    .accessibilityLabel("Show all people")
                    .accessibilityHint("Zooms out and centers every person on screen")
                    .accessibilityIdentifier("tree.fit")
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
        }
        .padding(16)
    }
}

private struct TreeGenerationLimitMenu: View {
    private enum Direction {
        case ancestors
        case descendants
    }

    @Binding var limits: TreeGenerationLimits
    let availableLevels: TreeAvailableGenerationLevels

    var body: some View {
        Menu {
            Menu("Levels above", systemImage: "arrow.up") {
                levelOptions(for: .ancestors, maximum: availableLevels.ancestorLevels)
            }
            .disabled(availableLevels.ancestorLevels == 0)
            .accessibilityIdentifier("tree.generationLimits.ancestors")

            Menu("Levels below", systemImage: "arrow.down") {
                levelOptions(for: .descendants, maximum: availableLevels.descendantLevels)
            }
            .disabled(availableLevels.descendantLevels == 0)
            .accessibilityIdentifier("tree.generationLimits.descendants")
        } label: {
            Label("Generation limits", systemImage: "arrow.up.and.down")
                .labelStyle(.iconOnly)
        }
        .buttonStyle(HeritgIconButtonStyle())
        .disabled(!availableLevels.hasAny)
        .accessibilityLabel("Generation limits")
        .accessibilityValue(accessibilityValue)
        .accessibilityHint("Limits how many family levels are shown above and below the selected person")
        .accessibilityIdentifier("tree.generationLimits")
    }

    @ViewBuilder
    private func levelOptions(for direction: Direction, maximum: Int) -> some View {
        let currentLimit = limit(for: direction)
        Button {
            setLimit(nil, for: direction)
        } label: {
            optionLabel(
                String(
                    localized: "All levels",
                    bundle: AppLanguage.selectedBundle,
                    locale: AppLanguage.selectedLocale
                ),
                isSelected: currentLimit == nil
            )
        }
        .accessibilityAddTraits(currentLimit == nil ? .isSelected : [])
        .accessibilityIdentifier(optionIdentifier(for: direction, value: "all"))

        ForEach(0...maximum, id: \.self) { level in
            Button {
                setLimit(level, for: direction)
            } label: {
                optionLabel(levelDescription(level), isSelected: currentLimit == level)
            }
            .accessibilityAddTraits(currentLimit == level ? .isSelected : [])
            .accessibilityIdentifier(optionIdentifier(for: direction, value: String(level)))
        }
    }

    @ViewBuilder
    private func optionLabel(_ title: String, isSelected: Bool) -> some View {
        if isSelected {
            Label(title, systemImage: "checkmark")
        } else {
            Text(title)
        }
    }

    private var displayedLimits: TreeGenerationLimits {
        limits.clamped(to: availableLevels)
    }

    private var accessibilityValue: String {
        let above = limitDescription(displayedLimits.ancestorLevels)
        let below = limitDescription(displayedLimits.descendantLevels)
        return String(
            localized: "Above: \(above); Below: \(below)",
            bundle: AppLanguage.selectedBundle,
            locale: AppLanguage.selectedLocale
        )
    }

    private func limit(for direction: Direction) -> Int? {
        switch direction {
        case .ancestors: displayedLimits.ancestorLevels
        case .descendants: displayedLimits.descendantLevels
        }
    }

    private func setLimit(_ limit: Int?, for direction: Direction) {
        switch direction {
        case .ancestors: limits.ancestorLevels = limit
        case .descendants: limits.descendantLevels = limit
        }
    }

    private func limitDescription(_ limit: Int?) -> String {
        limit.map(levelDescription)
            ?? String(
                localized: "All levels",
                bundle: AppLanguage.selectedBundle,
                locale: AppLanguage.selectedLocale
            )
    }

    private func levelDescription(_ level: Int) -> String {
        if level == 1 {
            return String(
                localized: "1 level",
                bundle: AppLanguage.selectedBundle,
                locale: AppLanguage.selectedLocale
            )
        }
        return String(
            localized: "\(level) levels",
            bundle: AppLanguage.selectedBundle,
            locale: AppLanguage.selectedLocale
        )
    }

    private func optionIdentifier(for direction: Direction, value: String) -> String {
        let directionName = direction == .ancestors ? "ancestors" : "descendants"
        return "tree.generationLimits.\(directionName).\(value)"
    }
}
