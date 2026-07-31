import SwiftUI

struct LinkRelationshipSheet: View {
    let targetName: String
    let people: [Person]
    let onSave: (Person, RelativeRole) throws -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var selectedRole: RelativeRole?
    @State private var errorMessage: String?

    private let columns = [GridItem(.flexible()), GridItem(.flexible())]

    var body: some View {
        NavigationStack {
            ScrollView {
                rolePicker
                    .padding(20)
            }
            .background(HeritgColor.canvas)
            .navigationTitle("Link to \(targetName)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .accessibilityIdentifier("relationship.link.cancel")
                }
            }
            .navigationDestination(item: $selectedRole) { role in
                peoplePicker(for: role)
                    .background(HeritgColor.canvas)
                    .navigationTitle("Choose \(role.title)")
                    .navigationBarTitleDisplayMode(.inline)
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private var rolePicker: some View {
        LazyVGrid(columns: columns, spacing: 12) {
            ForEach(RelativeRole.allCases) { role in
                Button {
                    selectedRole = role
                    errorMessage = nil
                } label: {
                    Label(role.title, systemImage: role.systemImage)
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(HeritgButtonStyle(variant: .secondary))
                .accessibilityLabel("Link as \(role.title)")
                .accessibilityIdentifier("relationship.link.role.\(role.rawValue)")
            }
        }
    }

    private func peoplePicker(for role: RelativeRole) -> some View {
        ScrollView {
            LazyVStack(spacing: 8) {
                if let errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(HeritgColor.danger)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .accessibilityIdentifier("relationship.link.error")
                }

                ForEach(people, id: \.id) { person in
                    Button { link(person, as: role) } label: {
                        HStack(spacing: 12) {
                            personAvatar(person)

                            VStack(alignment: .leading, spacing: 2) {
                                Text(person.displayName)
                                    .font(.body.bold())
                                    .foregroundStyle(HeritgColor.text)
                                if let lifeSummary = person.lifeSummary {
                                    Text(lifeSummary)
                                        .font(.caption)
                                        .foregroundStyle(HeritgColor.subtleText)
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)

                            Image(systemName: "link.badge.plus")
                                .foregroundStyle(HeritgColor.subtleText)
                                .accessibilityHidden(true)
                        }
                        .padding(12)
                        .background(HeritgColor.base)
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(HeritgColor.line))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(person.displayName)
                    .accessibilityValue(person.lifeSummary ?? "")
                    .accessibilityIdentifier("relationship.link.person.\(person.id)")
                }
            }
            .padding(20)
        }
    }

    private func personAvatar(_ person: Person) -> some View {
        ProfilePhotoAvatar(
            data: person.profilePhotoData,
            initials: person.displayName.prefix(1).uppercased(),
            size: 44
        )
            .overlay(Circle().stroke(HeritgColor.line))
            .accessibilityHidden(true)
    }

    private func link(_ person: Person, as role: RelativeRole) {
        do {
            try onSave(person, role)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
