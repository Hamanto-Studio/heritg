import Foundation

nonisolated extension HeritgArchive {
    static func validate(_ payload: HeritgArchivePayload) throws {
        guard payload.schemaVersion == schemaVersion else {
            throw HeritgArchiveError.unsupportedVersion
        }
        guard payload.people.count <= maximumPeople,
              payload.relationships.count <= maximumRelationships else {
            throw HeritgArchiveError.tooManyRecords
        }
        try validateDate(payload.exportedAt)
        try validateShort(payload.tree.id, allowsEmpty: false)
        try validateShort(payload.tree.title, allowsEmpty: false)
        try validateDate(payload.tree.createdAt)
        try validateDate(payload.tree.updatedAt)

        let personIDs = Set(payload.people.map(\.id))
        guard personIDs.count == payload.people.count else {
            throw HeritgArchiveError.invalidArchive
        }
        if let selectedID = payload.tree.lastSelectedPersonID,
           !personIDs.contains(selectedID) {
            throw HeritgArchiveError.invalidArchive
        }

        var totalPhotoBytes = 0
        for person in payload.people {
            guard person.treeID == payload.tree.id,
                  PersonGender(rawValue: person.genderRaw) != nil,
                  BirthDatePrecision(rawValue: person.birthDatePrecisionRaw) != nil,
                  person.birthOrderOverride.map({ $0 > 0 && $0 <= ChildOrder.maximum }) ?? true,
                  person.birthDate == nil || person.deathDate == nil || person.deathDate! >= person.birthDate! else {
                throw HeritgArchiveError.invalidArchive
            }
            try validateShort(person.id, allowsEmpty: false)
            try validateShort(person.treeID, allowsEmpty: false)
            try validateShort(person.displayName, allowsEmpty: false)
            try validateShort(person.addressLine)
            try validateShort(person.city)
            try validateShort(person.province)
            try validateShort(person.country)
            try validateShort(person.postalCode)
            try validateDate(person.createdAt)
            try person.birthDate.map(validateDate)
            try person.deathDate.map(validateDate)
            guard person.notes.utf8.count <= maximumNotesBytes else {
                throw HeritgArchiveError.fieldTooLarge
            }
            if let photo = person.profilePhotoData {
                guard photo.count <= maximumPhotoBytes else {
                    throw HeritgArchiveError.photoTooLarge
                }
                totalPhotoBytes += photo.count
                guard totalPhotoBytes <= maximumFileBytes else {
                    throw HeritgArchiveError.fileTooLarge
                }
            }
        }

        let relationshipIDs = Set(payload.relationships.map(\.id))
        guard relationshipIDs.count == payload.relationships.count else {
            throw HeritgArchiveError.invalidArchive
        }
        var relationshipSignatures = Set<String>()
        for relationship in payload.relationships {
            guard relationship.treeID == payload.tree.id,
                  relationship.fromPersonID != relationship.toPersonID,
                  personIDs.contains(relationship.fromPersonID),
                  personIDs.contains(relationship.toPersonID),
                  let kind = RelationshipKind(rawValue: relationship.kindRaw),
                  let subtype = RelationshipSubtype(rawValue: relationship.subtypeRaw),
                  subtypeIsValid(subtype, for: kind) else {
                throw HeritgArchiveError.invalidArchive
            }
            try validateShort(relationship.id, allowsEmpty: false)
            try validateShort(relationship.treeID, allowsEmpty: false)
            try validateShort(relationship.fromPersonID, allowsEmpty: false)
            try validateShort(relationship.toPersonID, allowsEmpty: false)
            try validateDate(relationship.createdAt)
            try relationship.marriageDate.map(validateDate)
            let endpoints = kind == .parent
                ? [relationship.fromPersonID, relationship.toPersonID]
                : [relationship.fromPersonID, relationship.toPersonID].sorted()
            guard relationshipSignatures.insert(
                "\(kind.rawValue)|\(endpoints[0])|\(endpoints[1])"
            ).inserted else {
                throw HeritgArchiveError.invalidArchive
            }
        }
    }

    private static func subtypeIsValid(
        _ subtype: RelationshipSubtype,
        for kind: RelationshipKind
    ) -> Bool {
        switch kind {
        case .parent:
            [.biologicalParent, .adoptiveParent, .fosterParent, .guardian, .stepParent].contains(subtype)
        case .partner:
            [.partner, .spouse, .formerPartner, .formerSpouse].contains(subtype)
        case .sibling:
            [.sibling, .halfSibling, .adoptiveSibling, .fosterSibling, .stepSibling].contains(subtype)
        }
    }

    private static func validateShort(_ value: String, allowsEmpty: Bool = true) throws {
        guard value.utf8.count <= maximumShortFieldBytes else {
            throw HeritgArchiveError.fieldTooLarge
        }
        if !allowsEmpty, value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            throw HeritgArchiveError.invalidArchive
        }
    }

    private static func validateDate(_ value: Date) throws {
        guard value.timeIntervalSinceReferenceDate.isFinite else {
            throw HeritgArchiveError.invalidArchive
        }
    }
}
