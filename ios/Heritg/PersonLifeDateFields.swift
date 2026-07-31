import SwiftUI

struct PersonLifeDateFields: View {
    @Binding var birthDate: Date
    @Binding var hasBirthDate: Bool
    @Binding var deathDate: Date
    @Binding var hasDeathDate: Bool

    var body: some View {
        if hasBirthDate {
            dateRow(
                title: "Birthday",
                date: $birthDate,
                deleteLabel: "Delete birthday",
                deleteIdentifier: "person.deleteBirthday"
            ) { hasBirthDate = false }
        } else {
            addButton(
                title: "Add birthday",
                systemImage: "calendar.badge.plus",
                identifier: "person.addBirthday"
            ) {
                birthDate = .now
                hasBirthDate = true
            }
        }

        if hasDeathDate {
            dateRow(
                title: "Death date",
                date: $deathDate,
                deleteLabel: "Delete death date",
                deleteIdentifier: "person.deleteDeathDate"
            ) { hasDeathDate = false }
        } else {
            addButton(
                title: "Add death date",
                systemImage: "calendar.badge.minus",
                identifier: "person.addDeathDate"
            ) {
                deathDate = .now
                hasDeathDate = true
            }
        }

        if let age {
            Text("Age \(age)")
                .font(.caption)
                .foregroundStyle(HeritgColor.subtleText)
        }
    }

    private func dateRow(
        title: LocalizedStringKey,
        date: Binding<Date>,
        deleteLabel: LocalizedStringKey,
        deleteIdentifier: String,
        onDelete: @escaping () -> Void
    ) -> some View {
        HStack {
            Text(title)
                .foregroundStyle(HeritgColor.subtleText)
            Spacer()
            DatePicker(title, selection: date, displayedComponents: .date)
                .labelsHidden()

            Button(deleteLabel, systemImage: "trash", action: onDelete)
                .labelStyle(.iconOnly)
                .buttonStyle(HeritgIconButtonStyle())
                .accessibilityLabel(deleteLabel)
                .accessibilityIdentifier(deleteIdentifier)
        }
    }

    private func addButton(
        title: LocalizedStringKey,
        systemImage: String,
        identifier: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(title, systemImage: systemImage, action: action)
            .accessibilityIdentifier(identifier)
    }

    private var age: Int? {
        guard hasBirthDate else { return nil }
        let referenceDate = hasDeathDate ? deathDate : .now
        guard referenceDate >= birthDate else { return nil }
        return Calendar.current.dateComponents([.year], from: birthDate, to: referenceDate).year
    }
}
