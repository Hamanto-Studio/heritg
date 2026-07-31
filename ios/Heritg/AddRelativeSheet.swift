import SwiftUI

struct AddRelativeSheet: View {
    let targetName: String
    let coParents: [Person]
    let onSave: (String, RelativeRole, PersonDetails, Date?, Person?) throws -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var selectedRole: RelativeRole?
    @State private var name = ""
    @State private var birthDate = Date.now
    @State private var hasBirthdayData = false
    @State private var showsBirthdayPicker = true
    @State private var marriageDate = Date.now
    @State private var hasMarriageDate = false
    @State private var showsMarriageDatePicker = true
    @State private var city = ""
    @State private var selectedCoParentID: String?
    @State private var errorMessage: String?
    @FocusState private var nameIsFocused: Bool

    private let columns = [
        GridItem(.flexible()),
        GridItem(.flexible()),
    ]

    private let roleGroups = [
        RelativeRoleGroup(
            id: "common",
            title: "Common",
            roles: [.father, .mother, .son, .daughter, .brother, .sister, .partner]
        ),
        RelativeRoleGroup(
            id: "parents",
            title: "Parents and guardians",
            roles: [
                .stepfather, .stepmother,
                .adoptiveFather, .adoptiveMother,
                .fosterFather, .fosterMother,
                .guardian,
            ]
        ),
        RelativeRoleGroup(
            id: "partners",
            title: "Partners and spouses",
            roles: [.husband, .wife, .formerPartner, .formerHusband, .formerWife]
        ),
        RelativeRoleGroup(
            id: "children",
            title: "Children",
            roles: [
                .stepson, .stepdaughter,
                .adoptiveSon, .adoptiveDaughter,
                .fosterSon, .fosterDaughter,
                .ward,
            ]
        ),
        RelativeRoleGroup(
            id: "siblings",
            title: "Siblings",
            roles: [
                .halfBrother, .halfSister,
                .stepbrother, .stepsister,
                .adoptiveBrother, .adoptiveSister,
                .fosterBrother, .fosterSister,
            ]
        ),
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                roleChoices
                    .padding(20)
            }
            .background(HeritgColor.canvas)
            .navigationTitle("Add to \(targetName)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .accessibilityIdentifier("relative.cancel")
                }
            }
            .navigationDestination(item: $selectedRole) { role in
                ScrollView {
                    relativeForm(role: role)
                        .padding(20)
                }
                .background(HeritgColor.canvas)
                .navigationTitle("New \(role.title)")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Add \(role.title)") {
                            save(role: role)
                        }
                        .accessibilityIdentifier("relative.save")
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private var roleChoices: some View {
        LazyVStack(alignment: .leading, spacing: 24) {
            ForEach(roleGroups) { group in
                VStack(alignment: .leading, spacing: 12) {
                    Text(group.title)
                        .font(.headline)
                        .foregroundStyle(HeritgColor.text)

                    LazyVGrid(columns: columns, spacing: 12) {
                        ForEach(group.roles) { role in
                            Button {
                                selectedRole = role
                            } label: {
                                Label(role.title, systemImage: role.systemImage)
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(HeritgButtonStyle(variant: .secondary))
                            .accessibilityLabel("Add \(role.title)")
                            .accessibilityIdentifier("relative.role.\(role.rawValue)")
                        }
                    }
                }
            }
        }
    }

    private func relativeForm(role: RelativeRole) -> some View {
        VStack(spacing: 16) {
            TextField("Name", text: $name)
                .textInputAutocapitalization(.words)
                .submitLabel(.done)
                .focused($nameIsFocused)
                .padding(14)
                .background(HeritgColor.recessed)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .accessibilityLabel("\(role.title) name")
                .accessibilityIdentifier("relative.name")
                .onSubmit { save(role: role) }

            if showsBirthdayPicker {
                HStack {
                    Text("Birthday")
                        .foregroundStyle(HeritgColor.subtleText)
                    Spacer()
                    DatePicker("Birthday", selection: $birthDate, displayedComponents: .date)
                        .labelsHidden()
                        .datePickerStyle(.compact)
                        .onChange(of: birthDate) {
                            hasBirthdayData = true
                        }
                        .accessibilityIdentifier("relative.birthDate")

                    if hasBirthdayData {
                        Button("Delete birthday", systemImage: "trash") {
                            hasBirthdayData = false
                            showsBirthdayPicker = false
                        }
                        .labelStyle(.iconOnly)
                        .buttonStyle(HeritgIconButtonStyle())
                        .accessibilityLabel("Delete birthday")
                        .accessibilityIdentifier("relative.deleteBirthday")
                    }
                }
            } else {
                Button("Add birthday", systemImage: "calendar.badge.plus") {
                    birthDate = .now
                    showsBirthdayPicker = true
                }
                .accessibilityLabel("Add birthday")
                .accessibilityIdentifier("relative.addBirthday")
            }

            if role.kind == .partner {
                marriageDateField
            }

            if role.allowsCoParent, !coParents.isEmpty {
                Picker("Co-parent", selection: $selectedCoParentID) {
                    Text("No co-parent").tag(nil as String?)
                    ForEach(coParents, id: \.id) { coParent in
                        Text(coParent.displayName).tag(coParent.id as String?)
                    }
                }
                .pickerStyle(.menu)
                .accessibilityIdentifier("relative.coParent")
            }

            VStack(alignment: .leading, spacing: 12) {
                Text("Details")
                    .font(.headline)

                TextField("City", text: $city)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            if let errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(HeritgColor.danger)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityIdentifier("relative.error")
            }

        }
        .onAppear {
            if !ProcessInfo.processInfo.arguments.contains("-ui_testing") {
                nameIsFocused = true
            }
        }
    }

    @ViewBuilder
    private var marriageDateField: some View {
        if showsMarriageDatePicker {
            HStack {
                Text("Marriage date")
                    .foregroundStyle(HeritgColor.subtleText)
                Spacer()
                DatePicker("Marriage date", selection: $marriageDate, displayedComponents: .date)
                    .labelsHidden()
                    .datePickerStyle(.compact)
                    .onChange(of: marriageDate) {
                        hasMarriageDate = true
                    }
                    .accessibilityIdentifier("relative.marriageDate")

                if hasMarriageDate {
                    Button("Delete marriage date", systemImage: "trash") {
                        hasMarriageDate = false
                        showsMarriageDatePicker = false
                    }
                    .labelStyle(.iconOnly)
                    .buttonStyle(HeritgIconButtonStyle())
                    .accessibilityLabel("Delete marriage date")
                    .accessibilityIdentifier("relative.deleteMarriageDate")
                }
            }
        } else {
            Button("Add marriage date", systemImage: "calendar.badge.plus") {
                marriageDate = .now
                showsMarriageDatePicker = true
            }
            .accessibilityIdentifier("relative.addMarriageDate")
        }
    }

    private func save(role: RelativeRole) {
        do {
            let coParent = role.allowsCoParent
                ? coParents.first { $0.id == selectedCoParentID }
                : nil
            try onSave(name, role, PersonDetails(
                birthDate: hasBirthdayData ? birthDate : nil,
                deathDate: nil,
                birthDatePrecision: .exact,
                notes: "",
                addressLine: "",
                city: city,
                province: "",
                country: "",
                postalCode: ""
            ), role.kind == .partner && hasMarriageDate ? marriageDate : nil, coParent)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct RelativeRoleGroup: Identifiable {
    let id: String
    let title: LocalizedStringResource
    let roles: [RelativeRole]
}
