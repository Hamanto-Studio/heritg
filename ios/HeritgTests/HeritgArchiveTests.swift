import Foundation
import SwiftData
import Testing
@testable import HERITG

struct HeritgArchiveTests {
    @MainActor
    @Test func encryptedBackupRestoresAllDataWithoutIDCollisions() throws {
        let context = try makeContext()
        let createdAt = Date(timeIntervalSince1970: 1_000)
        let updatedAt = Date(timeIntervalSince1970: 2_000)
        let birthDate = Date(timeIntervalSince1970: 3_000)
        let deathDate = Date(timeIntervalSince1970: 4_000)
        let marriageDate = Date(timeIntervalSince1970: 3_500)
        let tree = FamilyTree(
            id: "original-tree",
            title: "Secret Family",
            createdAt: createdAt,
            updatedAt: updatedAt
        )
        let first = Person(
            id: "first-person",
            treeID: tree.id,
            displayName: "Secret Name",
            gender: .female,
            createdAt: createdAt
        )
        first.birthDate = birthDate
        first.deathDate = deathDate
        first.birthDatePrecision = .month
        first.notes = "Private notes"
        first.addressLine = "1 Family Lane"
        first.city = "Bandung"
        first.province = "West Java"
        first.country = "Indonesia"
        first.postalCode = "40123"
        first.profilePhotoData = Data([0x89, 0x50, 0x4E, 0x47])
        let second = Person(
            id: "second-person",
            treeID: tree.id,
            displayName: "Partner",
            gender: .male,
            createdAt: updatedAt
        )
        let relationship = FamilyRelationship(
            id: "original-relationship",
            treeID: tree.id,
            fromPersonID: first.id,
            toPersonID: second.id,
            kind: .partner,
            subtype: .spouse,
            marriageDate: marriageDate,
            createdAt: updatedAt
        )
        tree.lastSelectedPersonID = first.id
        context.insert(tree)
        context.insert(first)
        context.insert(second)
        context.insert(relationship)
        try context.save()

        let payload = try HeritgArchive.payload(
            tree: tree,
            people: [first, second],
            relationships: [relationship]
        )
        let encrypted = try HeritgArchive.makeArchive(payload, password: "strong password")

        #expect(try HeritgArchive.protection(of: encrypted) == .encrypted)
        #expect(encrypted.range(of: Data("Secret Name".utf8)) == nil)
        #expect(encrypted.range(of: Data("Private notes".utf8)) == nil)

        let decrypted = try HeritgArchive.decrypt(encrypted, password: "strong password")
        let restoredTree = try FamilyGraph.importArchive(decrypted, in: context)
        let restoredPeople = try context.fetch(FetchDescriptor<Person>())
            .filter { $0.treeID == restoredTree.id }
        let restoredRelationships = try context.fetch(FetchDescriptor<FamilyRelationship>())
            .filter { $0.treeID == restoredTree.id }
        let restoredFirst = try #require(restoredPeople.first { $0.displayName == first.displayName })
        let restoredRelationship = try #require(restoredRelationships.first)

        #expect(restoredTree.id != tree.id)
        #expect(restoredTree.title == tree.title)
        #expect(restoredTree.createdAt == createdAt)
        #expect(restoredTree.updatedAt == updatedAt)
        #expect(restoredTree.lastSelectedPersonID == restoredFirst.id)
        #expect(restoredFirst.id != first.id)
        #expect(restoredFirst.gender == .female)
        #expect(restoredFirst.createdAt == createdAt)
        #expect(restoredFirst.birthDate == birthDate)
        #expect(restoredFirst.deathDate == deathDate)
        #expect(restoredFirst.birthDatePrecision == .month)
        #expect(restoredFirst.notes == "Private notes")
        #expect(restoredFirst.addressLine == "1 Family Lane")
        #expect(restoredFirst.city == "Bandung")
        #expect(restoredFirst.province == "West Java")
        #expect(restoredFirst.country == "Indonesia")
        #expect(restoredFirst.postalCode == "40123")
        #expect(restoredFirst.profilePhotoData == Data([0x89, 0x50, 0x4E, 0x47]))
        #expect(restoredRelationship.id != relationship.id)
        #expect(restoredRelationship.kind == .partner)
        #expect(restoredRelationship.subtype == .spouse)
        #expect(restoredRelationship.marriageDate == marriageDate)
        #expect(restoredRelationship.fromPersonID < restoredRelationship.toPersonID)
        #expect(restoredPeople.contains { $0.id == restoredRelationship.fromPersonID })
        #expect(restoredPeople.contains { $0.id == restoredRelationship.toPersonID })
        let firstEndpoint = try #require(restoredPeople.first {
            $0.id == restoredRelationship.fromPersonID
        })
        let secondEndpoint = try #require(restoredPeople.first {
            $0.id == restoredRelationship.toPersonID
        })
        #expect(throws: FamilyGraphError.self) {
            try FamilyGraph.link(
                firstEndpoint,
                to: secondEndpoint,
                as: .wife,
                relationships: restoredRelationships,
                in: context
            )
        }

        #expect(throws: HeritgArchiveError.self) {
            try HeritgArchive.decrypt(encrypted, password: "wrong password")
        }
        var tampered = encrypted
        tampered[tampered.index(before: tampered.endIndex)] ^= 0x01
        #expect(throws: HeritgArchiveError.self) {
            try HeritgArchive.decrypt(tampered, password: "strong password")
        }
    }

    @Test func shortNonEmptyPasswordStillEncryptsBackup() throws {
        let archive = try HeritgArchive.makeArchive(validPayload(), password: "x")

        #expect(try HeritgArchive.protection(of: archive) == .encrypted)
        #expect(try HeritgArchive.decrypt(archive, password: "x").tree.title == "Family")
    }

    @Test func emptyPasswordCreatesUnencryptedBackup() throws {
        let archive = try HeritgArchive.makeArchive(validPayload(), password: "")

        #expect(try HeritgArchive.protection(of: archive) == .unencrypted)
        #expect(try HeritgArchive.decodeUnencrypted(archive).tree.title == "Family")
        #expect(throws: HeritgArchiveError.self) {
            try HeritgArchive.decrypt(archive, password: "")
        }
    }

    @MainActor
    @Test func invalidPayloadDoesNotPartiallyImport() throws {
        let context = try makeContext()
        _ = try FamilyGraph.createTree(named: "Existing", in: context)
        let payload = validPayload(relationshipTargetID: "missing-person")
        let initialTreeCount = try context.fetchCount(FetchDescriptor<FamilyTree>())

        #expect(throws: HeritgArchiveError.self) {
            try FamilyGraph.importArchive(payload, in: context)
        }

        #expect(try context.fetchCount(FetchDescriptor<FamilyTree>()) == initialTreeCount)
        #expect(try context.fetchCount(FetchDescriptor<Person>()) == 0)
        #expect(try context.fetchCount(FetchDescriptor<FamilyRelationship>()) == 0)
    }

    @Test func validationRejectsReversedDuplicateSymmetricRelationships() throws {
        let payload = validPayload()
        let first = payload.relationships[0]
        let partner = HeritgArchiveRelationship(
            id: first.id,
            treeID: first.treeID,
            fromPersonID: first.fromPersonID,
            toPersonID: first.toPersonID,
            kindRaw: RelationshipKind.partner.rawValue,
            subtypeRaw: RelationshipSubtype.partner.rawValue,
            createdAt: first.createdAt,
            marriageDate: nil
        )
        let reversed = HeritgArchiveRelationship(
            id: "reversed-relationship",
            treeID: first.treeID,
            fromPersonID: first.toPersonID,
            toPersonID: first.fromPersonID,
            kindRaw: RelationshipKind.partner.rawValue,
            subtypeRaw: RelationshipSubtype.spouse.rawValue,
            createdAt: first.createdAt,
            marriageDate: nil
        )
        let duplicatePayload = HeritgArchivePayload(
            schemaVersion: payload.schemaVersion,
            exportedAt: payload.exportedAt,
            tree: payload.tree,
            people: payload.people,
            relationships: [partner, reversed]
        )

        #expect(throws: HeritgArchiveError.self) {
            try HeritgArchive.validate(duplicatePayload)
        }
    }

    private func validPayload(relationshipTargetID: String = "second") -> HeritgArchivePayload {
        HeritgArchivePayload(
            schemaVersion: 1,
            exportedAt: Date(timeIntervalSince1970: 10),
            tree: HeritgArchiveTree(
                id: "tree",
                title: "Family",
                createdAt: Date(timeIntervalSince1970: 1),
                updatedAt: Date(timeIntervalSince1970: 2),
                lastSelectedPersonID: "first"
            ),
            people: [
                archivePerson(id: "first"),
                archivePerson(id: "second"),
            ],
            relationships: [
                HeritgArchiveRelationship(
                    id: "relationship",
                    treeID: "tree",
                    fromPersonID: "first",
                    toPersonID: relationshipTargetID,
                    kindRaw: RelationshipKind.parent.rawValue,
                    subtypeRaw: RelationshipSubtype.biologicalParent.rawValue,
                    createdAt: Date(timeIntervalSince1970: 3),
                    marriageDate: nil
                ),
            ]
        )
    }

    private func archivePerson(id: String) -> HeritgArchivePerson {
        HeritgArchivePerson(
            id: id,
            treeID: "tree",
            displayName: id,
            genderRaw: PersonGender.unspecified.rawValue,
            createdAt: Date(timeIntervalSince1970: 1),
            birthDate: nil,
            deathDate: nil,
            birthDatePrecisionRaw: BirthDatePrecision.exact.rawValue,
            notes: "",
            addressLine: "",
            city: "",
            province: "",
            country: "",
            postalCode: "",
            profilePhotoData: nil
        )
    }

    @MainActor
    private func makeContext() throws -> ModelContext {
        let schema = Schema([FamilyTree.self, Person.self, FamilyRelationship.self])
        let configuration = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        let container = try ModelContainer(for: schema, configurations: [configuration])
        return ModelContext(container)
    }
}
