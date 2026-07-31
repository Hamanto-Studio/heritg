import Foundation
import SwiftData
import Testing
@testable import HERITG

struct FamilyTreeRelationshipFlowTests {
    @MainActor
    @Test func addingChildWithActiveCoParentCreatesBothParentRelationships() throws {
        let context = try makeContext()
        let tree = try FamilyGraph.createTree(named: "Family", in: context)
        let firstParent = try FamilyGraph.createPerson(named: "First", in: tree, context: context)
        let secondParent = try FamilyGraph.createPerson(named: "Second", in: tree, context: context)
        try FamilyGraph.link(firstParent, to: secondParent, as: .wife, relationships: [], in: context)
        let existingRelationships = try context.fetch(FetchDescriptor<FamilyRelationship>())

        let child = try FamilyGraph.addRelative(
            named: "Child",
            to: firstParent,
            as: .daughter,
            coParent: secondParent,
            relationships: existingRelationships,
            in: context
        )

        let parentRelationships = try context.fetch(FetchDescriptor<FamilyRelationship>())
            .filter { $0.kind == .parent && $0.toPersonID == child.id }
        #expect(parentRelationships.count == 2)
        #expect(Set(parentRelationships.map(\.fromPersonID)) == Set([firstParent.id, secondParent.id]))
        #expect(parentRelationships.allSatisfy { $0.subtype == .biologicalParent })
    }

    @MainActor
    @Test func formerPartnerCannotBeUsedAsCoParent() throws {
        let context = try makeContext()
        let tree = try FamilyGraph.createTree(named: "Family", in: context)
        let parent = try FamilyGraph.createPerson(named: "Parent", in: tree, context: context)
        let formerPartner = try FamilyGraph.createPerson(named: "Former", in: tree, context: context)
        try FamilyGraph.link(parent, to: formerPartner, as: .formerPartner, relationships: [], in: context)
        let relationships = try context.fetch(FetchDescriptor<FamilyRelationship>())
        let initialPersonCount = try context.fetchCount(FetchDescriptor<Person>())

        #expect(throws: FamilyGraphError.self) {
            try FamilyGraph.addRelative(
                named: "Child",
                to: parent,
                as: .son,
                coParent: formerPartner,
                relationships: relationships,
                in: context
            )
        }
        #expect(try context.fetchCount(FetchDescriptor<Person>()) == initialPersonCount)
        #expect(try context.fetchCount(FetchDescriptor<FamilyRelationship>()) == relationships.count)
    }

    @MainActor
    @Test func stepchildRoleDoesNotAcceptAnInferredCoParentType() throws {
        let context = try makeContext()
        let tree = try FamilyGraph.createTree(named: "Family", in: context)
        let stepParent = try FamilyGraph.createPerson(named: "Step Parent", in: tree, context: context)
        let partner = try FamilyGraph.createPerson(named: "Partner", in: tree, context: context)
        try FamilyGraph.link(stepParent, to: partner, as: .wife, relationships: [], in: context)
        let relationships = try context.fetch(FetchDescriptor<FamilyRelationship>())

        #expect(throws: FamilyGraphError.self) {
            try FamilyGraph.addRelative(
                named: "Child",
                to: stepParent,
                as: .stepson,
                coParent: partner,
                relationships: relationships,
                in: context
            )
        }
    }

    @MainActor
    @Test func linkingTwiceWithAStaleSnapshotStillRejectsTheDuplicate() throws {
        let context = try makeContext()
        let tree = try FamilyGraph.createTree(named: "Family", in: context)
        let first = try FamilyGraph.createPerson(named: "First", in: tree, context: context)
        let second = try FamilyGraph.createPerson(named: "Second", in: tree, context: context)

        try FamilyGraph.link(first, to: second, as: .sister, relationships: [], in: context)

        #expect(throws: FamilyGraphError.self) {
            try FamilyGraph.link(first, to: second, as: .sister, relationships: [], in: context)
        }
        #expect(try context.fetchCount(FetchDescriptor<FamilyRelationship>()) == 1)
    }

    @MainActor
    @Test func activePartnersExcludeFormerPartners() throws {
        let context = try makeContext()
        let tree = try FamilyGraph.createTree(named: "Family", in: context)
        let person = try FamilyGraph.createPerson(named: "Person", in: tree, context: context)
        let spouse = try FamilyGraph.createPerson(named: "Spouse", in: tree, context: context)
        let formerPartner = try FamilyGraph.createPerson(named: "Former", in: tree, context: context)
        try FamilyGraph.link(person, to: spouse, as: .husband, relationships: [], in: context)
        var relationships = try context.fetch(FetchDescriptor<FamilyRelationship>())
        try FamilyGraph.link(
            person,
            to: formerPartner,
            as: .formerPartner,
            relationships: relationships,
            in: context
        )
        relationships = try context.fetch(FetchDescriptor<FamilyRelationship>())

        let activePartners = FamilyGraph.activePartners(
            of: person,
            people: [formerPartner, spouse],
            relationships: relationships
        )

        #expect(activePartners.map(\.id) == [spouse.id])
    }

    @Test func entireTreePlacesOldestChildOnTheLeft() throws {
        let olderBirthDate = Date(timeIntervalSince1970: 100)
        let youngerBirthDate = Date(timeIntervalSince1970: 200)
        let people = [
            PersonSnapshot(id: "parent", name: "Parent", gender: .unspecified),
            PersonSnapshot(id: "younger", name: "Younger", gender: .male, birthDate: youngerBirthDate),
            PersonSnapshot(id: "older", name: "Older", gender: .female, birthDate: olderBirthDate),
        ]
        let relationships = [
            RelationshipSnapshot(id: "younger-edge", fromPersonID: "parent", toPersonID: "younger", kind: .parent),
            RelationshipSnapshot(id: "older-edge", fromPersonID: "parent", toPersonID: "older", kind: .parent),
        ]

        let layout = TreeLayout.make(
            focusedPersonID: nil,
            people: people,
            relationships: relationships
        )
        let olderX = try #require(layout.nodes.first { $0.id == "older" }?.position.x)
        let youngerX = try #require(layout.nodes.first { $0.id == "younger" }?.position.x)

        #expect(olderX < youngerX)
    }

    @Test func birthdayEditChangesLayoutWithoutChangingNodeIDs() {
        let relationships = [
            RelationshipSnapshot(id: "first-edge", fromPersonID: "parent", toPersonID: "first", kind: .parent),
            RelationshipSnapshot(id: "second-edge", fromPersonID: "parent", toPersonID: "second", kind: .parent),
        ]
        let firstLayout = TreeLayout.make(
            focusedPersonID: nil,
            people: [
                PersonSnapshot(id: "parent", name: "Parent", gender: .unspecified),
                PersonSnapshot(id: "first", name: "First", gender: .unspecified, birthDate: Date(timeIntervalSince1970: 100)),
                PersonSnapshot(id: "second", name: "Second", gender: .unspecified, birthDate: Date(timeIntervalSince1970: 200)),
            ],
            relationships: relationships
        )
        let secondLayout = TreeLayout.make(
            focusedPersonID: nil,
            people: [
                PersonSnapshot(id: "parent", name: "Parent", gender: .unspecified),
                PersonSnapshot(id: "first", name: "First", gender: .unspecified, birthDate: Date(timeIntervalSince1970: 300)),
                PersonSnapshot(id: "second", name: "Second", gender: .unspecified, birthDate: Date(timeIntervalSince1970: 200)),
            ],
            relationships: relationships
        )

        #expect(firstLayout.nodes.map(\.id).sorted() == secondLayout.nodes.map(\.id).sorted())
        #expect(
            firstLayout.nodes.first { $0.id == "first" }!.position.x <
                firstLayout.nodes.first { $0.id == "second" }!.position.x
        )
        #expect(
            secondLayout.nodes.first { $0.id == "second" }!.position.x <
                secondLayout.nodes.first { $0.id == "first" }!.position.x
        )
    }

    @Test func olderSpouseDoesNotPullYoungerChildAheadOfOlderSibling() throws {
        let people = [
            PersonSnapshot(id: "parent", name: "Parent", gender: .unspecified),
            PersonSnapshot(id: "older", name: "Older", gender: .female, birthDate: Date(timeIntervalSince1970: 100)),
            PersonSnapshot(id: "younger", name: "Younger", gender: .male, birthDate: Date(timeIntervalSince1970: 200)),
            PersonSnapshot(id: "spouse", name: "Spouse", gender: .unspecified, birthDate: Date(timeIntervalSince1970: 50)),
        ]
        let relationships = [
            RelationshipSnapshot(id: "older-edge", fromPersonID: "parent", toPersonID: "older", kind: .parent),
            RelationshipSnapshot(id: "younger-edge", fromPersonID: "parent", toPersonID: "younger", kind: .parent),
            RelationshipSnapshot(id: "partner-edge", fromPersonID: "younger", toPersonID: "spouse", kind: .partner),
        ]

        let layout = TreeLayout.make(
            focusedPersonID: nil,
            people: people,
            relationships: relationships
        )
        let olderX = try #require(layout.nodes.first { $0.id == "older" }?.position.x)
        let youngerX = try #require(layout.nodes.first { $0.id == "younger" }?.position.x)
        let spouseX = try #require(layout.nodes.first { $0.id == "spouse" }?.position.x)

        #expect(olderX < youngerX)
        #expect(youngerX < spouseX)
    }

    @Test func differentParentSetsFormIndependentOrderedSiblingGroups() throws {
        let people = [
            PersonSnapshot(id: "parent-a", name: "Parent A", gender: .unspecified),
            PersonSnapshot(id: "parent-b", name: "Parent B", gender: .unspecified),
            PersonSnapshot(id: "a-younger", name: "A Younger", gender: .unspecified, birthDate: Date(timeIntervalSince1970: 400)),
            PersonSnapshot(id: "b-older", name: "B Older", gender: .unspecified, birthDate: Date(timeIntervalSince1970: 200)),
            PersonSnapshot(id: "a-older", name: "A Older", gender: .unspecified, birthDate: Date(timeIntervalSince1970: 100)),
            PersonSnapshot(id: "b-younger", name: "B Younger", gender: .unspecified, birthDate: Date(timeIntervalSince1970: 300)),
        ]
        let relationships = [
            RelationshipSnapshot(id: "a-younger-edge", fromPersonID: "parent-a", toPersonID: "a-younger", kind: .parent),
            RelationshipSnapshot(id: "a-older-edge", fromPersonID: "parent-a", toPersonID: "a-older", kind: .parent),
            RelationshipSnapshot(id: "b-younger-edge", fromPersonID: "parent-b", toPersonID: "b-younger", kind: .parent),
            RelationshipSnapshot(id: "b-older-edge", fromPersonID: "parent-b", toPersonID: "b-older", kind: .parent),
        ]

        let layout = TreeLayout.make(
            focusedPersonID: nil,
            people: people,
            relationships: relationships
        )
        let positions = Dictionary(uniqueKeysWithValues: layout.nodes.map { ($0.id, $0.position.x) })
        let groupA = [positions["a-older"]!, positions["a-younger"]!]
        let groupB = [positions["b-older"]!, positions["b-younger"]!]

        #expect(positions["a-older"]! < positions["a-younger"]!)
        #expect(positions["b-older"]! < positions["b-younger"]!)
        #expect(groupA.max()! < groupB.min()! || groupB.max()! < groupA.min()!)
    }

    @MainActor
    private func makeContext() throws -> ModelContext {
        let schema = Schema([FamilyTree.self, Person.self, FamilyRelationship.self])
        let configuration = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        let container = try ModelContainer(for: schema, configurations: [configuration])
        return ModelContext(container)
    }
}
