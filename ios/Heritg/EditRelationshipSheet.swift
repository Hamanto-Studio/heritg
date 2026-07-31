import SwiftUI

struct EditRelationshipSheet: View {
    let personName: String
    let relativeName: String
    let onSave: (RelativeRole, Date?) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var selectedRole: RelativeRole
    @State private var marriageDate: Date
    @State private var hasMarriageDate: Bool

    init(
        personName: String,
        relativeName: String,
        currentRole: RelativeRole,
        marriageDate: Date?,
        onSave: @escaping (RelativeRole, Date?) -> Void
    ) {
        self.personName = personName
        self.relativeName = relativeName
        self.onSave = onSave
        _selectedRole = State(initialValue: currentRole)
        _marriageDate = State(initialValue: marriageDate ?? .now)
        _hasMarriageDate = State(initialValue: marriageDate != nil)
    }

    private let columns = [GridItem(.flexible()), GridItem(.flexible())]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("How is \(relativeName) related to \(personName)?")
                        .font(.headline)
                        .foregroundStyle(HeritgColor.text)

                    LazyVGrid(columns: columns, spacing: 12) {
                        ForEach(RelativeRole.allCases) { role in
                            Button {
                                selectedRole = role
                            } label: {
                                Label(role.title, systemImage: role.systemImage)
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(HeritgButtonStyle(
                                variant: selectedRole == role ? .primary : .secondary
                            ))
                            .accessibilityAddTraits(selectedRole == role ? .isSelected : [])
                            .accessibilityIdentifier("relationship.edit.role.\(role.rawValue)")
                        }
                    }

                    if selectedRole.kind == .partner {
                        if hasMarriageDate {
                            HStack {
                                Text("Marriage date")
                                    .foregroundStyle(HeritgColor.subtleText)
                                Spacer()
                                DatePicker(
                                    "Marriage date",
                                    selection: $marriageDate,
                                    displayedComponents: .date
                                )
                                .labelsHidden()
                                Button("Delete marriage date", systemImage: "trash") {
                                    hasMarriageDate = false
                                }
                                .labelStyle(.iconOnly)
                                .buttonStyle(HeritgIconButtonStyle())
                                .accessibilityIdentifier("relationship.edit.deleteMarriageDate")
                            }
                        } else {
                            Button("Add marriage date", systemImage: "calendar.badge.plus") {
                                marriageDate = .now
                                hasMarriageDate = true
                            }
                            .accessibilityIdentifier("relationship.edit.addMarriageDate")
                        }
                    }
                }
                .padding(20)
            }
            .background(HeritgColor.canvas)
            .navigationTitle("Edit relationship")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .accessibilityIdentifier("relationship.edit.cancel")
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        onSave(
                            selectedRole,
                            selectedRole.kind == .partner && hasMarriageDate ? marriageDate : nil
                        )
                        dismiss()
                    }
                    .accessibilityIdentifier("relationship.edit.save")
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}
