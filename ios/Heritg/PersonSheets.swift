import SwiftUI

struct NewPersonSheet: View {
    let title: String
    let actionTitle: String
    let accessibilityPrefix: String
    let onSave: (String) throws -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var errorMessage: String?
    @FocusState private var nameIsFocused: Bool

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                TextField("Name", text: $name)
                    .textInputAutocapitalization(.words)
                    .submitLabel(.done)
                    .focused($nameIsFocused)
                    .padding(14)
                    .background(HeritgColor.recessed)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .accessibilityLabel("Name")
                    .accessibilityIdentifier("\(accessibilityPrefix).nameField")
                    .onSubmit(save)

                if let errorMessage {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundStyle(HeritgColor.danger)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .accessibilityIdentifier("\(accessibilityPrefix).error")
                }

                Spacer()
            }
            .padding(20)
            .background(HeritgColor.canvas)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .accessibilityIdentifier("\(accessibilityPrefix).cancel")
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button(actionTitle, action: save)
                        .accessibilityIdentifier("\(accessibilityPrefix).save")
                }
            }
        }
        .presentationDetents([.height(300)])
        .presentationDragIndicator(.visible)
        .onAppear { nameIsFocused = true }
    }

    private func save() {
        do {
            try onSave(name)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct PersonSheet: View {
    let person: Person
    let relatedPeople: [(relationship: FamilyRelationship, person: Person, role: String)]
    let availablePeople: [Person]
    let onSave: (String, PersonGender, PersonDetails, [FamilyRelationship], [(person: Person, role: RelativeRole, marriageDate: Date?)]) throws -> Void
    let onDeletePerson: () throws -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var name: String
    @State private var gender: PersonGender
    @State private var birthDate: Date
    @State private var hasBirthdayData: Bool
    @State private var deathDate: Date
    @State private var hasDeathDate: Bool
    @State private var city: String
    @State private var profilePhotoData: Data?
    @State private var confirmingDelete = false
    @State private var confirmingDiscard = false
    @State private var errorMessage: String?
    @State private var isLinkingPerson = false
    @State private var editingRelationship: RelationshipEdit?
    @State private var removedRelationshipIDs = Set<String>()
    @State private var pendingLinks = [PendingPersonLink]()
    @FocusState private var focusedField: PersonField?

    init(
        person: Person,
        relatedPeople: [(relationship: FamilyRelationship, person: Person, role: String)],
        availablePeople: [Person],
        onSave: @escaping (String, PersonGender, PersonDetails, [FamilyRelationship], [(person: Person, role: RelativeRole, marriageDate: Date?)]) throws -> Void,
        onDeletePerson: @escaping () throws -> Void
    ) {
        self.person = person
        self.relatedPeople = relatedPeople
        self.availablePeople = availablePeople
        self.onSave = onSave
        self.onDeletePerson = onDeletePerson
        _name = State(initialValue: person.displayName)
        _gender = State(initialValue: person.gender)
        _birthDate = State(initialValue: person.birthDate ?? .now)
        _hasBirthdayData = State(initialValue: person.birthDate != nil)
        _deathDate = State(initialValue: person.deathDate ?? .now)
        _hasDeathDate = State(initialValue: person.deathDate != nil)
        _city = State(initialValue: person.city)
        _profilePhotoData = State(initialValue: person.profilePhotoData)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    ProfilePhotoEditor(
                        personName: name,
                        photoData: $profilePhotoData
                    )

                    editName

                    profileDetails

                    if !visibleRelatedPeople.isEmpty || !pendingLinks.isEmpty || !linkablePeople.isEmpty {
                        relationshipList
                    }

                    if let errorMessage {
                        Text(errorMessage)
                            .font(.footnote)
                            .foregroundStyle(HeritgColor.danger)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .accessibilityIdentifier("person.error")
                    }

                    deletePersonSection
                }
                .padding(20)
                .contentShape(Rectangle())
                .onTapGesture { focusedField = nil }
            }
            .scrollDismissesKeyboard(.interactively)
            .background(HeritgColor.canvas)
            .navigationTitle(person.displayName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: requestDismiss)
                        .accessibilityIdentifier("person.close")
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", action: savePerson)
                        .disabled(!hasUnsavedChanges)
                        .accessibilityIdentifier("person.save")
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { focusedField = nil }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(hasUnsavedChanges)
        .alert("Discard changes?", isPresented: $confirmingDiscard) {
            Button("Discard Changes", role: .destructive) { dismiss() }
            Button("Continue Editing", role: .cancel) { }
        } message: {
            Text("Are you sure you want to discard your unsaved changes?")
        }
        .sheet(isPresented: $isLinkingPerson) {
            LinkRelationshipSheet(
                targetName: name,
                people: linkablePeople,
                onSave: stageLink
            )
        }
        .sheet(item: $editingRelationship) { edit in
            EditRelationshipSheet(
                personName: name,
                relativeName: edit.person.displayName,
                currentRole: edit.role,
                marriageDate: edit.relationship.marriageDate
            ) { role, marriageDate in
                removedRelationshipIDs.insert(edit.relationship.id)
                pendingLinks.removeAll { $0.person.id == edit.person.id }
                pendingLinks.append(PendingPersonLink(
                    person: edit.person,
                    role: role,
                    marriageDate: marriageDate
                ))
            }
        }
    }

    private var editName: some View {
        TextField("Name", text: $name)
            .textInputAutocapitalization(.words)
            .submitLabel(.next)
            .focused($focusedField, equals: .name)
            .onSubmit { focusedField = .city }
            .padding(14)
            .background(HeritgColor.recessed)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .accessibilityLabel("Person name")
            .accessibilityIdentifier("person.nameField")
    }

    private var profileDetails: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Details")
                .font(.headline)

            HStack {
                Text("Gender")
                    .foregroundStyle(HeritgColor.subtleText)
                Spacer()
                Picker("Gender", selection: $gender) {
                    ForEach(PersonGender.allCases) { gender in
                        Text(gender.title).tag(gender)
                    }
                }
                .labelsHidden()
                .accessibilityLabel("Gender")
                .accessibilityValue(gender.title)
                .accessibilityIdentifier("person.gender")
            }

            PersonLifeDateFields(
                birthDate: $birthDate,
                hasBirthDate: $hasBirthdayData,
                deathDate: $deathDate,
                hasDeathDate: $hasDeathDate
            )

            TextField("City", text: $city)
                .textInputAutocapitalization(.words)
                .submitLabel(.done)
                .focused($focusedField, equals: .city)
                .onSubmit { focusedField = nil }
        }
        .padding(14)
        .background(HeritgColor.base)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(HeritgColor.line))
    }

    private var relationshipList: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Family")
                    .font(.headline)
                Spacer()
                Button("Link family member", systemImage: "link.badge.plus") {
                    isLinkingPerson = true
                }
                .labelStyle(.iconOnly)
                .buttonStyle(HeritgIconButtonStyle())
                .accessibilityLabel("Link an existing family member")
                .accessibilityIdentifier("relationship.link")
            }

            ForEach(visibleRelatedPeople, id: \.relationship.id) { item in
                HStack {
                    Button {
                        editingRelationship = RelationshipEdit(
                            relationship: item.relationship,
                            person: item.person,
                            role: Self.relationshipEditRole(
                                relationship: item.relationship,
                                relative: item.person,
                                focusedPersonID: person.id
                            )
                        )
                    } label: {
                        VStack(alignment: .leading, spacing: 2) {
                        Text(item.person.displayName)
                            .foregroundStyle(HeritgColor.text)
                        Text(item.role)
                            .font(.caption)
                            .foregroundStyle(HeritgColor.subtleText)
                        if let marriageYear = item.relationship.marriageYear {
                            Text("Married \(marriageYear)")
                                .font(.caption)
                                .foregroundStyle(HeritgColor.subtleText)
                        }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Edit relationship with \(item.person.displayName)")
                    .accessibilityHint("Changes the relationship type")
                    .accessibilityIdentifier("relationship.edit.\(item.relationship.id)")

                    Spacer()

                    Button("Remove") {
                        removedRelationshipIDs.insert(item.relationship.id)
                    }
                    .buttonStyle(HeritgButtonStyle(variant: .destructive))
                    .accessibilityLabel("Remove relationship with \(item.person.displayName)")
                    .accessibilityIdentifier("relationship.delete.\(item.relationship.id)")
                }
                .padding(12)
                .background(HeritgColor.base)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(HeritgColor.line))
            }

            ForEach(pendingLinks) { item in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.person.displayName)
                            .foregroundStyle(HeritgColor.text)
                        Text(item.role.title)
                            .font(.caption)
                            .foregroundStyle(HeritgColor.subtleText)
                        if let marriageDate = item.marriageDate {
                            let marriageYear = String(Calendar.current.component(.year, from: marriageDate))
                            Text("Married \(marriageYear)")
                                .font(.caption)
                                .foregroundStyle(HeritgColor.subtleText)
                        }
                    }

                    Spacer()

                    Button("Remove") {
                        pendingLinks.removeAll { $0.id == item.id }
                    }
                    .buttonStyle(HeritgButtonStyle(variant: .destructive))
                    .accessibilityLabel("Remove relationship with \(item.person.displayName)")
                    .accessibilityIdentifier("relationship.delete.pending.\(item.id)")
                }
                .padding(12)
                .background(HeritgColor.base)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(HeritgColor.line))
            }
        }
        .accessibilityIdentifier("relationship.list")
    }

    @ViewBuilder
    private var deletePersonSection: some View {
        if confirmingDelete {
            VStack(spacing: 12) {
                Text("Remove \(person.displayName) and their relationships?")
                    .font(.callout)
                    .multilineTextAlignment(.center)

                HStack {
                    Button("Cancel") { confirmingDelete = false }
                        .buttonStyle(HeritgButtonStyle(variant: .secondary))
                        .accessibilityLabel("Cancel removing person")
                        .accessibilityIdentifier("person.delete.cancel")

                    Button("Remove") {
                        perform {
                            try onDeletePerson()
                            dismiss()
                        }
                    }
                    .buttonStyle(HeritgButtonStyle(variant: .destructive))
                    .accessibilityLabel("Confirm removing \(person.displayName)")
                    .accessibilityIdentifier("person.delete.confirm")
                }
            }
        } else {
            Button {
                confirmingDelete = true
            } label: {
                Text("Remove person").frame(maxWidth: .infinity)
            }
            .buttonStyle(HeritgButtonStyle(variant: .destructive))
            .accessibilityLabel("Remove \(person.displayName)")
            .accessibilityIdentifier("person.delete")
        }
    }

    private func perform(_ operation: () throws -> Void) {
        do {
            try operation()
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func savePerson() {
        perform {
            try onSave(name, gender, PersonDetails(
                birthDate: hasBirthdayData ? birthDate : nil,
                deathDate: hasDeathDate ? deathDate : nil,
                birthDatePrecision: .exact,
                notes: person.notes,
                addressLine: person.addressLine,
                city: city,
                province: person.province,
                country: person.country,
                postalCode: person.postalCode,
                profilePhotoData: profilePhotoData
            ), relatedPeople.compactMap {
                removedRelationshipIDs.contains($0.relationship.id) ? $0.relationship : nil
            }, pendingLinks.map { ($0.person, $0.role, $0.marriageDate) })
            dismiss()
        }
    }

    private var visibleRelatedPeople: [(relationship: FamilyRelationship, person: Person, role: String)] {
        relatedPeople.filter { !removedRelationshipIDs.contains($0.relationship.id) }
    }

    static func relationshipEditRole(
        relationship: FamilyRelationship,
        relative: Person,
        focusedPersonID: String
    ) -> RelativeRole {
        switch relationship.kind {
        case .parent:
            return parentRole(
                subtype: relationship.subtype,
                relativeIsParent: relationship.fromPersonID == relative.id &&
                    relationship.toPersonID == focusedPersonID,
                gender: relative.gender
            )
        case .partner:
            switch relationship.subtype {
            case .spouse: return relative.gender == .female ? .wife : .husband
            case .formerSpouse: return relative.gender == .female ? .formerWife : .formerHusband
            case .formerPartner: return .formerPartner
            default: return .partner
            }
        case .sibling:
            let female = relative.gender == .female
            switch relationship.subtype {
            case .halfSibling: return female ? .halfSister : .halfBrother
            case .adoptiveSibling: return female ? .adoptiveSister : .adoptiveBrother
            case .fosterSibling: return female ? .fosterSister : .fosterBrother
            case .stepSibling: return female ? .stepsister : .stepbrother
            default: return female ? .sister : .brother
            }
        }
    }

    private static func parentRole(
        subtype: RelationshipSubtype,
        relativeIsParent: Bool,
        gender: PersonGender
    ) -> RelativeRole {
        let female = gender == .female
        switch (subtype, relativeIsParent) {
        case (.adoptiveParent, true): return female ? .adoptiveMother : .adoptiveFather
        case (.adoptiveParent, false): return female ? .adoptiveDaughter : .adoptiveSon
        case (.fosterParent, true): return female ? .fosterMother : .fosterFather
        case (.fosterParent, false): return female ? .fosterDaughter : .fosterSon
        case (.guardian, true): return .guardian
        case (.guardian, false): return .ward
        case (.stepParent, true): return female ? .stepmother : .stepfather
        case (.stepParent, false): return female ? .stepdaughter : .stepson
        case (_, true): return female ? .mother : .father
        case (_, false): return female ? .daughter : .son
        }
    }

    private var linkablePeople: [Person] {
        let linkedIDs = Set(visibleRelatedPeople.map { $0.person.id } + pendingLinks.map { $0.person.id })
        return availablePeople.filter { !linkedIDs.contains($0.id) }
    }

    private var draftBirthDate: Date? {
        hasBirthdayData ? birthDate : nil
    }

    private var hasUnsavedChanges: Bool {
        name != person.displayName ||
            gender != person.gender ||
            draftBirthDate != person.birthDate ||
            (hasDeathDate ? deathDate : nil) != person.deathDate ||
            city != person.city ||
            profilePhotoData != person.profilePhotoData ||
            !removedRelationshipIDs.isEmpty ||
            !pendingLinks.isEmpty
    }

    private func requestDismiss() {
        if hasUnsavedChanges {
            confirmingDiscard = true
        } else {
            dismiss()
        }
    }

    private func stageLink(_ relative: Person, as role: RelativeRole) throws {
        guard !pendingLinks.contains(where: { $0.person.id == relative.id }) else {
            throw FamilyGraphError.duplicateRelationship
        }
        pendingLinks.append(PendingPersonLink(person: relative, role: role, marriageDate: nil))
    }

    private enum PersonField: Hashable {
        case name
        case city
    }
}

private struct PendingPersonLink: Identifiable {
    let person: Person
    let role: RelativeRole
    let marriageDate: Date?
    var id: String { "\(person.id)-\(role.rawValue)" }
}

private struct RelationshipEdit: Identifiable {
    let relationship: FamilyRelationship
    let person: Person
    let role: RelativeRole

    var id: String { relationship.id }
}
