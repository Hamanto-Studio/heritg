import Foundation
import SwiftData

enum FamilyGraphError: LocalizedError {
    case emptyName
    case selfRelationship
    case duplicateRelationship
    case deathBeforeBirth
    case crossTreeRelationship
    case invalidCoParent

    var errorDescription: String? {
        switch self {
        case .emptyName: String(localized: "Enter a name.", locale: AppLanguage.selectedLocale)
        case .selfRelationship:
            String(
                localized: "A person cannot be related to themselves.",
                locale: AppLanguage.selectedLocale
            )
        case .duplicateRelationship:
            String(localized: "This relationship already exists.", locale: AppLanguage.selectedLocale)
        case .deathBeforeBirth:
            String(
                localized: "Death date cannot be earlier than birth date.",
                locale: AppLanguage.selectedLocale
            )
        case .crossTreeRelationship:
            String(
                localized: "People from different family trees cannot be linked.",
                locale: AppLanguage.selectedLocale
            )
        case .invalidCoParent:
            String(
                localized: "The selected co-parent must be an active partner.",
                locale: AppLanguage.selectedLocale
            )
        }
    }
}

@MainActor
enum FamilyGraph {
    static func createTree(named name: String, in context: ModelContext) throws -> FamilyTree {
        let tree = FamilyTree(title: try validatedName(name))
        context.insert(tree)
        try saveOrRollback(context)
        return tree
    }

    static func renameTree(
        _ tree: FamilyTree,
        to name: String,
        in context: ModelContext
    ) throws {
        tree.title = try validatedName(name)
        tree.updatedAt = .now
        try saveOrRollback(context)
    }

    static func deleteTree(
        _ tree: FamilyTree,
        in context: ModelContext
    ) throws {
        let treeID = tree.id
        let people = try context.fetch(FetchDescriptor<Person>(
            predicate: #Predicate { $0.treeID == treeID }
        ))
        let relationships = try context.fetch(FetchDescriptor<FamilyRelationship>(
            predicate: #Predicate { $0.treeID == treeID }
        ))
        for relationship in relationships {
            context.delete(relationship)
        }
        for person in people {
            context.delete(person)
        }
        context.delete(tree)
        try saveOrRollback(context)
    }

    static func importGEDCOM(
        _ importData: GEDCOMImport,
        named name: String? = nil,
        in context: ModelContext
    ) throws -> FamilyTree {
        let tree = FamilyTree(title: try validatedName(name ?? importData.suggestedTitle))
        var peopleBySourceID = [String: Person]()

        for record in importData.people {
            if let birthDate = record.birthDate,
               let deathDate = record.deathDate,
               deathDate < birthDate {
                throw FamilyGraphError.deathBeforeBirth
            }
            let person = Person(
                treeID: tree.id,
                displayName: record.name.isEmpty
                    ? String(localized: "Unnamed person", locale: AppLanguage.selectedLocale)
                    : record.name,
                gender: record.gender
            )
            person.birthDate = record.birthDate
            person.deathDate = record.deathDate
            person.birthDatePrecision = record.birthDatePrecision
            person.city = record.city
            person.notes = record.notes
            peopleBySourceID[record.sourceID] = person
        }

        let importedRelationships = importData.relationships.compactMap { record -> FamilyRelationship? in
            guard let from = peopleBySourceID[record.fromSourceID],
                  let to = peopleBySourceID[record.toSourceID] else { return nil }
            return FamilyRelationship(
                treeID: tree.id,
                fromPersonID: from.id,
                toPersonID: to.id,
                kind: record.kind,
                subtype: record.subtype,
                marriageDate: record.marriageDate
            )
        }

        context.insert(tree)
        for person in peopleBySourceID.values { context.insert(person) }
        for relationship in importedRelationships { context.insert(relationship) }
        try saveOrRollback(context)
        return tree
    }

    static func importArchive(
        _ payload: HeritgArchivePayload,
        in context: ModelContext
    ) throws -> FamilyTree {
        try HeritgArchive.validate(payload)

        let existingTreeIDs = Set(try context.fetch(FetchDescriptor<FamilyTree>()).map(\.id))
        let existingPersonIDs = Set(try context.fetch(FetchDescriptor<Person>()).map(\.id))
        let existingRelationshipIDs = Set(try context.fetch(FetchDescriptor<FamilyRelationship>()).map(\.id))
        guard !existingTreeIDs.contains(payload.tree.id),
              existingPersonIDs.isDisjoint(with: payload.people.map(\.id)),
              existingRelationshipIDs.isDisjoint(with: payload.relationships.map(\.id)) else {
            throw HeritgArchiveError.identifierCollision
        }

        let tree = FamilyTree(
            id: payload.tree.id,
            title: payload.tree.title,
            createdAt: payload.tree.createdAt,
            updatedAt: payload.tree.updatedAt,
            lastSelectedPersonID: payload.tree.lastSelectedPersonID
        )
        let people = payload.people.map { record in
            let person = Person(
                id: record.id,
                treeID: record.treeID,
                displayName: record.displayName,
                gender: PersonGender(rawValue: record.genderRaw)!,
                createdAt: record.createdAt
            )
            person.birthDate = record.birthDate
            person.deathDate = record.deathDate
            person.birthDatePrecision = BirthDatePrecision(rawValue: record.birthDatePrecisionRaw)!
            person.notes = record.notes
            person.addressLine = record.addressLine
            person.city = record.city
            person.province = record.province
            person.country = record.country
            person.postalCode = record.postalCode
            person.profilePhotoData = record.profilePhotoData
            return person
        }
        let relationships = payload.relationships.map { record in
            return FamilyRelationship(
                id: record.id,
                treeID: record.treeID,
                fromPersonID: record.fromPersonID,
                toPersonID: record.toPersonID,
                kind: RelationshipKind(rawValue: record.kindRaw)!,
                subtype: RelationshipSubtype(rawValue: record.subtypeRaw)!,
                marriageDate: record.marriageDate,
                createdAt: record.createdAt
            )
        }

        let importContext = ModelContext(context.container)
        importContext.autosaveEnabled = false
        importContext.insert(tree)
        people.forEach(importContext.insert)
        relationships.forEach(importContext.insert)
        try saveOrRollback(importContext)

        let importedTrees = try context.fetch(FetchDescriptor<FamilyTree>(
            predicate: #Predicate { $0.id == payload.tree.id }
        ))
        guard let importedTree = importedTrees.first else {
            throw HeritgArchiveError.invalidArchive
        }
        return importedTree
    }

    static func createPerson(
        named name: String,
        in tree: FamilyTree,
        context: ModelContext
    ) throws -> Person {
        let person = Person(treeID: tree.id, displayName: try validatedName(name))
        context.insert(person)
        tree.updatedAt = .now
        try saveOrRollback(context)
        return person
    }

    static func update(
        _ person: Person,
        name: String,
        gender: PersonGender,
        details: PersonDetails = .empty,
        in context: ModelContext
    ) throws {
        let validatedName = try validatedName(name)
        try apply(details, to: person)
        person.displayName = validatedName
        person.gender = gender
        try saveOrRollback(context)
    }

    static func update(
        _ person: Person,
        name: String,
        gender: PersonGender,
        details: PersonDetails,
        deleting relationshipsToDelete: [FamilyRelationship],
        linking peopleToLink: [(person: Person, role: RelativeRole, marriageDate: Date?)],
        relationships: [FamilyRelationship],
        in context: ModelContext
    ) throws {
        let validatedName = try validatedName(name)
        guard relationshipsToDelete.allSatisfy({ $0.treeID == person.treeID }) else {
            throw FamilyGraphError.crossTreeRelationship
        }
        let deletedIDs = Set(relationshipsToDelete.map(\.id))
        var relationshipSignatures = Set(relationships.compactMap { relationship in
            deletedIDs.contains(relationship.id) || relationship.treeID != person.treeID ? nil : relationshipSignature(
                treeID: relationship.treeID,
                from: relationship.fromPersonID,
                to: relationship.toPersonID,
                kind: relationship.kind
            )
        })
        var relationshipsToInsert = [FamilyRelationship]()

        for item in peopleToLink {
            guard person.id != item.person.id else { throw FamilyGraphError.selfRelationship }
            guard person.treeID == item.person.treeID else { throw FamilyGraphError.crossTreeRelationship }
            let endpoints = relationshipEndpoints(
                personID: person.id,
                relativeID: item.person.id,
                role: item.role
            )
            guard relationshipSignatures.insert(relationshipSignature(
                treeID: person.treeID,
                from: endpoints.from,
                to: endpoints.to,
                kind: endpoints.kind
            )).inserted else {
                throw FamilyGraphError.duplicateRelationship
            }
            relationshipsToInsert.append(FamilyRelationship(
                treeID: person.treeID,
                fromPersonID: endpoints.from,
                toPersonID: endpoints.to,
                kind: endpoints.kind,
                subtype: endpoints.subtype,
                marriageDate: endpoints.kind == .partner ? item.marriageDate : nil
            ))
        }

        try apply(details, to: person)
        person.displayName = validatedName
        person.gender = gender
        for relationship in relationshipsToDelete {
            context.delete(relationship)
        }
        for relationship in relationshipsToInsert {
            context.insert(relationship)
        }
        try saveOrRollback(context)
    }

    static func addRelative(
        named name: String,
        to person: Person,
        as role: RelativeRole,
        details: PersonDetails = .empty,
        marriageDate: Date? = nil,
        coParent: Person? = nil,
        relationships: [FamilyRelationship] = [],
        in context: ModelContext
    ) throws -> Person {
        if let coParent {
            guard role.allowsCoParent,
                  coParent.id != person.id,
                  coParent.treeID == person.treeID,
                  relationships.contains(where: {
                      $0.treeID == person.treeID &&
                          $0.kind == .partner &&
                          $0.subtype.isActiveUnion &&
                          Set([$0.fromPersonID, $0.toPersonID]) == Set([person.id, coParent.id])
                  }) else {
                throw FamilyGraphError.invalidCoParent
            }
        }

        let relative = Person(
            treeID: person.treeID,
            displayName: try validatedName(name),
            gender: role.gender
        )
        try apply(details, to: relative)
        let endpoints = relationshipEndpoints(personID: person.id, relativeID: relative.id, role: role)
        let relationship = FamilyRelationship(
            treeID: person.treeID,
            fromPersonID: endpoints.from,
            toPersonID: endpoints.to,
            kind: endpoints.kind,
            subtype: endpoints.subtype,
            marriageDate: endpoints.kind == .partner ? marriageDate : nil
        )

        context.insert(relative)
        context.insert(relationship)
        if let coParent {
            context.insert(FamilyRelationship(
                treeID: person.treeID,
                fromPersonID: coParent.id,
                toPersonID: relative.id,
                kind: .parent,
                subtype: endpoints.subtype
            ))
        }
        try saveOrRollback(context)
        return relative
    }

    static func activePartners(
        of person: Person,
        people: [Person],
        relationships: [FamilyRelationship]
    ) -> [Person] {
        let partnerIDs = Set(relationships.compactMap { relationship -> String? in
            guard relationship.treeID == person.treeID,
                  relationship.kind == .partner,
                  relationship.subtype.isActiveUnion else {
                return nil
            }
            if relationship.fromPersonID == person.id {
                return relationship.toPersonID
            }
            if relationship.toPersonID == person.id {
                return relationship.fromPersonID
            }
            return nil
        })
        return people.filter {
            $0.treeID == person.treeID && partnerIDs.contains($0.id)
        }
    }

    static func deleteRelationship(
        _ relationship: FamilyRelationship,
        in context: ModelContext
    ) throws {
        context.delete(relationship)
        try saveOrRollback(context)
    }

    static func link(
        _ person: Person,
        to relative: Person,
        as role: RelativeRole,
        relationships: [FamilyRelationship],
        in context: ModelContext
    ) throws {
        guard person.id != relative.id else { throw FamilyGraphError.selfRelationship }
        guard person.treeID == relative.treeID else { throw FamilyGraphError.crossTreeRelationship }
        let endpoints = relationshipEndpoints(personID: person.id, relativeID: relative.id, role: role)
        let treeID = person.treeID
        let storedRelationships = try context.fetch(FetchDescriptor<FamilyRelationship>(
            predicate: #Predicate { $0.treeID == treeID }
        ))
        guard !(relationships + storedRelationships).contains(where: {
            $0.treeID == person.treeID &&
                $0.kind == endpoints.kind &&
                $0.fromPersonID == endpoints.from &&
                $0.toPersonID == endpoints.to
        }) else {
            throw FamilyGraphError.duplicateRelationship
        }

        context.insert(FamilyRelationship(
            treeID: person.treeID,
            fromPersonID: endpoints.from,
            toPersonID: endpoints.to,
            kind: endpoints.kind,
            subtype: endpoints.subtype
        ))
        try saveOrRollback(context)
    }

    static func deletePerson(
        _ person: Person,
        relationships: [FamilyRelationship],
        in context: ModelContext
    ) throws {
        for relationship in relationships where relationship.treeID == person.treeID &&
            (relationship.fromPersonID == person.id || relationship.toPersonID == person.id) {
            context.delete(relationship)
        }
        context.delete(person)
        try saveOrRollback(context)
    }

    private static func validatedName(_ name: String) throws -> String {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw FamilyGraphError.emptyName }
        return trimmed
    }

    private static func apply(_ details: PersonDetails, to person: Person) throws {
        if let birthDate = details.birthDate,
           let deathDate = details.deathDate,
           deathDate < birthDate {
            throw FamilyGraphError.deathBeforeBirth
        }
        person.birthDate = details.birthDate
        person.deathDate = details.deathDate
        person.birthDatePrecision = details.birthDatePrecision
        person.notes = details.notes.trimmingCharacters(in: .whitespacesAndNewlines)
        person.addressLine = details.addressLine.trimmingCharacters(in: .whitespacesAndNewlines)
        person.city = details.city.trimmingCharacters(in: .whitespacesAndNewlines)
        person.province = details.province.trimmingCharacters(in: .whitespacesAndNewlines)
        person.country = details.country.trimmingCharacters(in: .whitespacesAndNewlines)
        person.postalCode = details.postalCode.trimmingCharacters(in: .whitespacesAndNewlines)
        person.profilePhotoData = details.profilePhotoData
    }

    private static func saveOrRollback(_ context: ModelContext) throws {
        do {
            try context.save()
        } catch {
            context.rollback()
            throw error
        }
    }

    private static func relationshipEndpoints(
        personID: String,
        relativeID: String,
        role: RelativeRole
    ) -> (from: String, to: String, kind: RelationshipKind, subtype: RelationshipSubtype) {
        switch role.kind {
        case .parent where role.relativeIsParent:
            return (relativeID, personID, .parent, role.subtype)
        case .parent:
            return (personID, relativeID, .parent, role.subtype)
        case .partner:
            let ordered = [personID, relativeID].sorted()
            return (ordered[0], ordered[1], .partner, role.subtype)
        case .sibling:
            let ordered = [personID, relativeID].sorted()
            return (ordered[0], ordered[1], .sibling, role.subtype)
        }
    }

    private static func relationshipSignature(
        treeID: String,
        from: String,
        to: String,
        kind: RelationshipKind
    ) -> String {
        "\(treeID)|\(kind.rawValue)|\(from)|\(to)"
    }
}
