//
//  HeritgTests.swift
//  HeritgTests
//
//  Created by Hamanto Studio on 28/07/26.
//

import CoreGraphics
import CoreData
import SwiftUI
import Testing
import UIKit
@testable import HERITG

private final class HeritgTestBundleLocator {}

struct HeritgTests {
    @MainActor
    @Test func opensReleasedSwiftDataStoreWithCoreData() throws {
        let bundle = Bundle(for: HeritgTestBundleLocator.self)
        let fixtureURL = try #require(
            bundle.url(
                forResource: "swiftdata-1.0.0",
                withExtension: "store",
                subdirectory: "Fixtures"
            ) ?? bundle.url(
                forResource: "swiftdata-1.0.0",
                withExtension: "store"
            )
        )
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let storeURL = directory.appendingPathComponent("default.store")
        try FileManager.default.copyItem(at: fixtureURL, to: storeURL)

        let controller = PersistenceController(
            inMemory: false,
            storeURL: storeURL
        )
        let context = controller.container.viewContext
        let tree = try #require(context.fetch(FamilyTree.fetchRequest()).first)
        let people = try context.fetch(Person.fetchRequest(treeID: tree.id))
        let first = try #require(people.first { $0.id == "person-1" })
        let relationship = try #require(
            context.fetch(FamilyRelationship.fetchRequest(treeID: tree.id)).first
        )

        #expect(tree.title == "Migration fixture")
        #expect(tree.lastSelectedPersonID == first.id)
        #expect(people.map(\.displayName).sorted() == ["Ayu", "Bima"])
        #expect(first.gender == .female)
        #expect(first.birthDatePrecision == .year)
        #expect(first.notes == "Family notes")
        #expect(first.addressLine == "1 Example Road")
        #expect(first.city == "Bandung")
        #expect(first.province == "West Java")
        #expect(first.country == "Indonesia")
        #expect(first.postalCode == "40111")
        #expect(first.profilePhotoData == Data([0x01, 0x02, 0x03, 0x04]))
        #expect(relationship.kind == .partner)
        #expect(relationship.subtype == .spouse)
        #expect(relationship.fromPersonID == "person-1")
        #expect(relationship.toPersonID == "person-2")

        tree.title = "Migrated Family"
        try context.save()
        context.reset()
        #expect(try context.fetch(FamilyTree.fetchRequest()).first?.title == "Migrated Family")
        try closePersistentStores(in: controller)
    }

    @MainActor
    @Test func diskStoreReopensAllFamilyData() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }

        let storeURL = directory.appendingPathComponent("default.store")
        let photoData = Data([0x01, 0x02, 0x03, 0x04])
        let birthDate = Date(timeIntervalSince1970: 315_532_800)
        let marriageDate = Date(timeIntervalSince1970: 946_684_800)

        do {
            let controller = PersistenceController(
                inMemory: false,
                storeURL: storeURL
            )
            let context = controller.container.viewContext
            let tree = FamilyTree(
                context: context,
                id: "tree-1",
                title: "Migration Family",
                lastSelectedPersonID: "person-1"
            )
            let first = Person(
                context: context,
                id: "person-1",
                treeID: tree.id,
                displayName: "Ayu",
                gender: .female
            )
            first.birthDate = birthDate
            first.birthDatePrecision = .year
            first.notes = "Family notes"
            first.addressLine = "1 Example Road"
            first.city = "Bandung"
            first.province = "West Java"
            first.country = "Indonesia"
            first.postalCode = "40111"
            first.profilePhotoData = photoData
            _ = Person(
                context: context,
                id: "person-2",
                treeID: tree.id,
                displayName: "Bima",
                gender: .male
            )
            _ = FamilyRelationship(
                context: context,
                id: "relationship-1",
                treeID: tree.id,
                fromPersonID: "person-1",
                toPersonID: "person-2",
                kind: .partner,
                subtype: .spouse,
                marriageDate: marriageDate
            )
            try context.save()
            context.reset()
            try closePersistentStores(in: controller)
        }

        let controller = PersistenceController(
            inMemory: false,
            storeURL: storeURL
        )
        let context = controller.container.viewContext
        let tree = try #require(context.fetch(FamilyTree.fetchRequest()).first)
        let people = try context.fetch(Person.fetchRequest(treeID: tree.id))
        let first = try #require(people.first { $0.id == "person-1" })
        let relationship = try #require(
            context.fetch(FamilyRelationship.fetchRequest(treeID: tree.id)).first
        )

        #expect(tree.title == "Migration Family")
        #expect(tree.lastSelectedPersonID == first.id)
        #expect(people.count == 2)
        #expect(first.birthDate == birthDate)
        #expect(first.birthDatePrecision == .year)
        #expect(first.notes == "Family notes")
        #expect(first.addressLine == "1 Example Road")
        #expect(first.city == "Bandung")
        #expect(first.province == "West Java")
        #expect(first.country == "Indonesia")
        #expect(first.postalCode == "40111")
        #expect(first.profilePhotoData == photoData)
        #expect(relationship.kind == .partner)
        #expect(relationship.subtype == .spouse)
        #expect(relationship.marriageDate == marriageDate)
        #expect(PersistenceController.productionStoreURL.lastPathComponent == "default.store")
        context.reset()
        try closePersistentStores(in: controller)
    }

    @MainActor
    @Test func familyTreesRestoreTheirOwnLastSelectedPerson() throws {
        let context = try makeContext()
        let firstTree = try FamilyGraph.createTree(named: "First Family", in: context)
        let secondTree = try FamilyGraph.createTree(named: "Second Family", in: context)
        let firstPerson = try FamilyGraph.createPerson(named: "First", in: firstTree, context: context)
        let rememberedPerson = try FamilyGraph.createPerson(named: "Remembered", in: firstTree, context: context)
        let otherPerson = try FamilyGraph.createPerson(named: "Other", in: secondTree, context: context)
        let people = [firstPerson, rememberedPerson, otherPerson]

        firstTree.lastSelectedPersonID = rememberedPerson.id
        secondTree.lastSelectedPersonID = otherPerson.id
        try context.save()

        #expect(firstTree.resolvedFocusID(in: people) == rememberedPerson.id)
        #expect(secondTree.resolvedFocusID(in: people) == otherPerson.id)

        firstTree.lastSelectedPersonID = "deleted-person"
        #expect(firstTree.resolvedFocusID(in: people) == firstPerson.id)
    }

    @MainActor
    @Test func profilePhotoCropProducesSquareDerivative() throws {
        let source = UIGraphicsImageRenderer(size: CGSize(width: 120, height: 80)).image { renderer in
            UIColor.systemBlue.setFill()
            renderer.fill(CGRect(x: 0, y: 0, width: 120, height: 80))
        }
        let crop = CGRect(x: 20, y: 0, width: 80, height: 80)

        let data = try #require(ProfilePhotoProcessor.crop(image: source, rect: crop))
        let preview = try #require(ProfilePhotoProcessor.preview(from: data))
        let croppedImage = try #require(UIImage(data: data)?.cgImage)

        #expect(preview.size.width == preview.size.height)
        #expect(croppedImage.width == croppedImage.height)
        #expect(croppedImage.width == Int(80 * source.scale))
    }

    @MainActor
    @Test func profilePhotoPersistsThroughPersonUpdate() throws {
        let context = try makeContext()
        let tree = try FamilyGraph.createTree(named: "Rina Family", in: context)
        let person = try FamilyGraph.createPerson(named: "Rina", in: tree, context: context)
        let image = UIGraphicsImageRenderer(size: CGSize(width: 24, height: 24)).image { renderer in
            UIColor.systemGreen.setFill()
            renderer.fill(CGRect(x: 0, y: 0, width: 24, height: 24))
        }
        let photoData = try #require(image.jpegData(compressionQuality: 0.8))
        var details = PersonDetails.empty
        details.profilePhotoData = photoData

        try FamilyGraph.update(
            person,
            name: person.displayName,
            gender: person.gender,
            details: details,
            in: context
        )

        let savedPerson = try #require(context.fetch(Person.fetchRequest()).first)
        #expect(savedPerson.profilePhotoData == photoData)
    }

    @MainActor
    @Test func addsSpecificFamilyRoles() throws {
        let context = try makeContext()
        let tree = try FamilyGraph.createTree(named: "Rina Family", in: context)
        let focus = try FamilyGraph.createPerson(named: "Rina", in: tree, context: context)
        let parent = try FamilyGraph.addRelative(named: "Budi", to: focus, as: .father, in: context)
        let partner = try FamilyGraph.addRelative(named: "Ari", to: focus, as: .partner, in: context)
        let child = try FamilyGraph.addRelative(named: "Nina", to: focus, as: .daughter, in: context)
        let sibling = try FamilyGraph.addRelative(named: "Dina", to: focus, as: .sister, in: context)
        let relationships = try context.fetch(FamilyRelationship.fetchRequest())

        #expect(relationships.count == 4)
        #expect(parent.gender == .male)
        #expect(child.gender == .female)
        #expect(sibling.gender == .female)
        #expect(relationships.contains {
            $0.kind == .parent && $0.fromPersonID == parent.id && $0.toPersonID == focus.id
        })
        #expect(relationships.contains {
            $0.kind == .partner && Set([$0.fromPersonID, $0.toPersonID]) == Set([focus.id, partner.id])
        })
        #expect(relationships.contains {
            $0.kind == .parent && $0.fromPersonID == focus.id && $0.toPersonID == child.id
        })
        #expect(relationships.contains {
            $0.kind == .sibling && Set([$0.fromPersonID, $0.toPersonID]) == Set([focus.id, sibling.id])
        })
    }

    @MainActor
    @Test func linksExistingPeopleAndRejectsDuplicateRelationships() throws {
        let context = try makeContext()
        let tree = try FamilyGraph.createTree(named: "Hari Family", in: context)
        let hari = try FamilyGraph.createPerson(named: "Hari", in: tree, context: context)
        let maya = try FamilyGraph.createPerson(named: "Maya", in: tree, context: context)
        maya.gender = .female

        try FamilyGraph.link(hari, to: maya, as: .partner, relationships: [], in: context)
        let relationships = try context.fetch(FamilyRelationship.fetchRequest())

        #expect(relationships.count == 1)
        #expect(relationships[0].kind == .partner)
        #expect(FamilyRoleLabel.label(
            relativeGender: maya.gender,
            relationshipKind: .partner,
            focusedPersonID: hari.id,
            fromPersonID: relationships[0].fromPersonID,
            toPersonID: relationships[0].toPersonID
        ) == AppLanguage.localized("Partner"))
        #expect(throws: FamilyGraphError.self) {
            try FamilyGraph.link(hari, to: maya, as: .partner, relationships: relationships, in: context)
        }
        #expect(throws: FamilyGraphError.self) {
            try FamilyGraph.link(hari, to: hari, as: .partner, relationships: relationships, in: context)
        }
    }

    @MainActor
    @Test func deletingPersonRemovesTheirRelationships() throws {
        let context = try makeContext()
        let tree = try FamilyGraph.createTree(named: "Rina Family", in: context)
        let focus = try FamilyGraph.createPerson(named: "Rina", in: tree, context: context)
        let child = try FamilyGraph.addRelative(named: "Nina", to: focus, as: .daughter, in: context)
        let relationships = try context.fetch(FamilyRelationship.fetchRequest())

        try FamilyGraph.deletePerson(child, relationships: relationships, in: context)

        #expect(try context.count(for: Person.fetchRequest()) == 1)
        #expect(try context.count(for: FamilyRelationship.fetchRequest()) == 0)
    }

    @MainActor
    @Test func savesPersonAndRelationshipDraftTogether() throws {
        let context = try makeContext()
        let tree = try FamilyGraph.createTree(named: "Rina Family", in: context)
        let person = try FamilyGraph.createPerson(named: "Rina", in: tree, context: context)
        _ = try FamilyGraph.addRelative(named: "Nina", to: person, as: .daughter, in: context)
        let sibling = try FamilyGraph.createPerson(named: "Dina", in: tree, context: context)
        let existingRelationships = try context.fetch(FamilyRelationship.fetchRequest())
        var details = PersonDetails.empty
        details.city = "Bandung"

        try FamilyGraph.update(
            person,
            name: "Rina Wijaya",
            gender: .female,
            details: details,
            deleting: existingRelationships,
            linking: [(sibling, .sister, nil)],
            relationships: existingRelationships,
            in: context
        )

        let savedRelationships = try context.fetch(FamilyRelationship.fetchRequest())
        #expect(person.displayName == "Rina Wijaya")
        #expect(person.city == "Bandung")
        #expect(savedRelationships.count == 1)
        #expect(savedRelationships[0].kind == .sibling)
        #expect(Set([savedRelationships[0].fromPersonID, savedRelationships[0].toPersonID]) == Set([person.id, sibling.id]))
    }

    @MainActor
    @Test func keepsTreesIsolatedAndRejectsCrossTreeLinks() throws {
        let context = try makeContext()
        let firstTree = try FamilyGraph.createTree(named: "First Family", in: context)
        let secondTree = try FamilyGraph.createTree(named: "Second Family", in: context)
        let firstPerson = try FamilyGraph.createPerson(named: "Rina", in: firstTree, context: context)
        let secondPerson = try FamilyGraph.createPerson(named: "Maya", in: secondTree, context: context)

        #expect(firstPerson.treeID == firstTree.id)
        #expect(secondPerson.treeID == secondTree.id)
        #expect(throws: FamilyGraphError.crossTreeRelationship) {
            try FamilyGraph.link(firstPerson, to: secondPerson, as: .sister, relationships: [], in: context)
        }

        try FamilyGraph.deleteTree(
            firstTree,
            in: context
        )
        let remainingPeople = try context.fetch(Person.fetchRequest())
        #expect(remainingPeople.map(\.id) == [secondPerson.id])
    }

    @MainActor
    @Test func importsGEDCOMAsANewScopedTree() async throws {
        let context = try makeContext()
        let gedcom = """
        0 HEAD
        1 GEDC
        2 VERS 7.0
        1 CHAR UTF-8
        0 @I1@ INDI
        1 NAME Rina
        1 SEX F
        0 @I2@ INDI
        1 NAME Maya
        1 SEX F
        0 @F1@ FAM
        1 WIFE @I1@
        1 CHIL @I2@
        0 TRLR
        """

        let parsed = try GEDCOMImporter.parse(
            data: Data(gedcom.utf8),
            sourceName: "Rina-Family.ged"
        )
        let tree = try await FamilyGraph.importGEDCOMInBackground(parsed, in: context)
        let importedPeople = try context.fetch(Person.fetchRequest())
        let importedRelationships = try context.fetch(FamilyRelationship.fetchRequest())

        #expect(tree.title == "Rina-Family")
        #expect(tree.createdAt <= tree.updatedAt)
        #expect(importedPeople.count == 2)
        #expect(importedPeople.allSatisfy { $0.treeID == tree.id })
        #expect(importedRelationships.count == 1)
        #expect(importedRelationships[0].treeID == tree.id)
        #expect(importedRelationships[0].kind == .parent)
    }

    @Test func focusedLayoutPlacesImmediateFamily() {
        let people = [
            PersonSnapshot(id: "focus", name: "Rina", gender: .female),
            PersonSnapshot(id: "parent", name: "Budi", gender: .male),
            PersonSnapshot(id: "partner", name: "Ari", gender: .unspecified),
            PersonSnapshot(id: "child", name: "Nina", gender: .female),
            PersonSnapshot(id: "sibling", name: "Dina", gender: .female),
        ]
        let relationships = [
            RelationshipSnapshot(id: "r1", fromPersonID: "parent", toPersonID: "focus", kind: .parent),
            RelationshipSnapshot(id: "r2", fromPersonID: "focus", toPersonID: "partner", kind: .partner),
            RelationshipSnapshot(id: "r3", fromPersonID: "focus", toPersonID: "child", kind: .parent),
            RelationshipSnapshot(id: "r4", fromPersonID: "focus", toPersonID: "sibling", kind: .sibling),
        ]

        let layout = TreeLayout.make(
            focusedPersonID: "focus",
            people: people,
            relationships: relationships
        )

        #expect(layout.nodes.count == 5)
        #expect(layout.edges.count == 4)
        #expect(layout.nodes.first(where: { $0.id == "parent" })?.position.y == -260)
        #expect(layout.nodes.first(where: { $0.id == "child" })?.position.y == 260)
        #expect(layout.nodes.first(where: { $0.id == "parent" })?.role == AppLanguage.localized("Father"))
        #expect(layout.nodes.first(where: { $0.id == "child" })?.role == AppLanguage.localized("Daughter"))
        #expect(layout.nodes.first(where: { $0.id == "sibling" })?.role == AppLanguage.localized("Sister"))
        #expect(layout.nodes.first(where: { $0.id == "focus" })?.role == AppLanguage.localized("You"))
    }

    @Test func unselectedLayoutShowsEntireTree() {
        let people = (0..<3).map { index in
            PersonSnapshot(id: "person\(index)", name: "Person \(index)", gender: .unspecified)
        }
        let relationships = [
            RelationshipSnapshot(id: "r1", fromPersonID: "person0", toPersonID: "person1", kind: .parent),
            RelationshipSnapshot(id: "r2", fromPersonID: "person1", toPersonID: "person2", kind: .parent),
        ]

        let layout = TreeLayout.make(
            focusedPersonID: nil,
            people: people,
            relationships: relationships
        )

        #expect(layout.nodes.count == 3)
        #expect(layout.edges.count == 2)
        #expect(layout.nodes.first(where: { $0.id == "person0" })?.position.y == -260)
        #expect(layout.nodes.first(where: { $0.id == "person2" })?.position.y == 260)
    }

    @Test func selectedEntireTreeKeepsAllNodesAndLabelsSelectionAsYou() {
        let people = (0..<3).map { index in
            PersonSnapshot(id: "person\(index)", name: "Person \(index)", gender: .unspecified)
        }
        let relationships = [
            RelationshipSnapshot(id: "r1", fromPersonID: "person0", toPersonID: "person1", kind: .parent),
            RelationshipSnapshot(id: "r2", fromPersonID: "person1", toPersonID: "person2", kind: .parent),
        ]

        let layout = TreeLayout.make(
            focusedPersonID: nil,
            people: people,
            relationships: relationships,
            selectedPersonID: "person1"
        )

        #expect(layout.nodes.count == 3)
        #expect(layout.nodes.first(where: { $0.id == "person1" })?.role == AppLanguage.localized("You"))
    }

    @Test func changingSelectionDoesNotMoveEntireTreeNodes() {
        let people = ["a", "b", "c"].map {
            PersonSnapshot(id: $0, name: $0, gender: .unspecified)
        }
        let relationships = [
            RelationshipSnapshot(id: "r1", fromPersonID: "a", toPersonID: "b", kind: .parent),
            RelationshipSnapshot(id: "r2", fromPersonID: "b", toPersonID: "c", kind: .parent),
            RelationshipSnapshot(id: "r3", fromPersonID: "c", toPersonID: "a", kind: .parent),
        ]

        let firstLayout = TreeLayout.make(
            focusedPersonID: nil,
            people: people,
            relationships: relationships,
            selectedPersonID: "a"
        )
        let secondLayout = TreeLayout.make(
            focusedPersonID: nil,
            people: people,
            relationships: relationships,
            selectedPersonID: "b"
        )

        #expect(
            Dictionary(uniqueKeysWithValues: firstLayout.nodes.map { ($0.id, $0.position) }) ==
                Dictionary(uniqueKeysWithValues: secondLayout.nodes.map { ($0.id, $0.position) })
        )
    }

    @Test func contradictoryParentCycleDoesNotCollapseEveryGeneration() {
        let people = ["a", "b", "c"].map {
            PersonSnapshot(id: $0, name: $0, gender: .unspecified)
        }
        let relationships = [
            RelationshipSnapshot(id: "r1", fromPersonID: "a", toPersonID: "b", kind: .parent),
            RelationshipSnapshot(id: "r2", fromPersonID: "b", toPersonID: "c", kind: .parent),
            RelationshipSnapshot(id: "r3", fromPersonID: "c", toPersonID: "a", kind: .parent),
        ]

        let layout = TreeLayout.make(
            focusedPersonID: nil,
            people: people,
            relationships: relationships,
            selectedPersonID: "b"
        )
        let rows = Set(layout.nodes.map { $0.position.y })

        #expect(rows.count == 3)
        #expect(layout.edges.count == 2)
    }

    @Test func relationshipFixtureLabelsEverySupportedRole() {
        let fixture: [(String, PersonGender, String)] = [
            ("rina", .female, AppLanguage.localized("You")),
            ("budi", .male, AppLanguage.localized("Father")),
            ("maya", .female, AppLanguage.localized("Mother")),
            ("pat", .unspecified, AppLanguage.localized("Parent")),
            ("arif", .male, AppLanguage.localized("Grandfather")),
            ("gita", .female, AppLanguage.localized("Grandmother")),
            ("hasan", .male, AppLanguage.localized("great-\(AppLanguage.localized("Grandfather"))")),
            ("ben", .male, AppLanguage.localized("Brother")),
            ("sofia", .female, AppLanguage.localized("Sister")),
            ("robin", .unspecified, AppLanguage.localized("Sibling")),
            ("uly", .male, AppLanguage.localized("Uncle")),
            ("anne", .female, AppLanguage.localized("Aunt")),
            ("cora", .female, AppLanguage.localized("First cousin")),
            ("jordan", .unspecified, AppLanguage.localized("Partner")),
            ("sean", .male, AppLanguage.localized("Son")),
            ("dina", .female, AppLanguage.localized("Daughter")),
            ("casey", .unspecified, AppLanguage.localized("Child")),
            ("nate", .male, AppLanguage.localized("Nephew")),
            ("nia", .female, AppLanguage.localized("Niece")),
            ("nori", .unspecified, AppLanguage.localized("Niece/Nephew")),
            ("gia", .female, AppLanguage.localized("Granddaughter")),
            ("teo", .male, AppLanguage.localized("great-\(AppLanguage.localized("Grandson"))")),
        ]
        let parentPairs = [
            ("hasan", "arif"), ("arif", "budi"), ("gita", "budi"), ("arif", "uly"),
            ("gita", "uly"), ("arif", "anne"), ("gita", "anne"), ("budi", "rina"),
            ("maya", "rina"), ("pat", "rina"), ("budi", "ben"), ("maya", "ben"),
            ("budi", "sofia"), ("maya", "sofia"), ("budi", "robin"), ("maya", "robin"),
            ("uly", "cora"), ("ben", "nate"), ("ben", "nia"), ("ben", "nori"),
            ("rina", "sean"), ("rina", "dina"), ("rina", "casey"), ("dina", "gia"),
            ("gia", "teo"),
        ]
        let people = fixture.map { PersonSnapshot(id: $0.0, name: $0.0, gender: $0.1) }
        let relationships = parentPairs.enumerated().map {
            RelationshipSnapshot(id: "parent\($0.offset)", fromPersonID: $0.element.0, toPersonID: $0.element.1, kind: .parent)
        } + [RelationshipSnapshot(id: "partner", fromPersonID: "rina", toPersonID: "jordan", kind: .partner)]

        let layout = TreeLayout.make(
            focusedPersonID: nil,
            people: people,
            relationships: relationships,
            selectedPersonID: "rina"
        )

        for item in fixture {
            #expect(layout.nodes.first(where: { $0.id == item.0 })?.role == item.2)
        }

        let positions = Dictionary(uniqueKeysWithValues: layout.nodes.map { ($0.id, $0.position) })
        #expect(positions["budi"]?.y == positions["maya"]?.y)
        #expect(positions["budi"]?.y == positions["pat"]?.y)
        #expect(positions["rina"]?.y == positions["jordan"]?.y)
        #expect(positions["sean"]?.y == positions["dina"]?.y)
        #expect(positions["dina"]?.y == positions["casey"]?.y)
        #expect(positions["hasan"]!.y < positions["arif"]!.y)
        #expect(positions["arif"]!.y < positions["budi"]!.y)
        #expect(positions["budi"]!.y < positions["rina"]!.y)
        #expect(positions["rina"]!.y < positions["dina"]!.y)
        #expect(positions["dina"]!.y < positions["gia"]!.y)
        #expect(positions["gia"]!.y < positions["teo"]!.y)
    }

    @Test func parentConnectorStartsBelowRelationshipLabel() {
        let parentPath = TreeConnector.path(
            kind: .parent,
            from: CGPoint(x: 0, y: 0),
            to: CGPoint(x: 100, y: 170),
            avatarRadius: 32
        )
        let siblingPath = TreeConnector.path(
            kind: .sibling,
            from: CGPoint(x: 0, y: 0),
            to: CGPoint(x: 150, y: 0),
            avatarRadius: 32
        )

        #expect(
            parentPath.boundingRect.minY
                == TreeVisualMetrics.labelOffset + TreeVisualMetrics.labelHeight / 2
        )
        #expect(parentPath.boundingRect.maxY == 138)
        #expect(siblingPath.boundingRect.minX == 32)
        #expect(siblingPath.boundingRect.maxX == 118)
    }

    @Test func singleParentBranchConnectsParentToChild() {
        let path = TreeConnector.parentFamilyPath(
            parents: [CGPoint(x: 100, y: 0)],
            child: CGPoint(x: 0, y: 170),
            avatarRadius: 32,
            scale: 1
        )

        #expect(path.boundingRect.minX == 0)
        #expect(path.boundingRect.maxX == 100)
        #expect(path.boundingRect.maxY == 138)
    }

    @Test func siblingGroupUsesOneSharedFamilyBranch() {
        let path = TreeConnector.familyPath(
            parents: [CGPoint(x: 50, y: 0), CGPoint(x: 150, y: 0)],
            children: [CGPoint(x: 0, y: 170), CGPoint(x: 100, y: 170), CGPoint(x: 200, y: 170)],
            avatarRadius: 32,
            scale: 1
        )

        #expect(path.boundingRect.minX == 0)
        #expect(path.boundingRect.maxX == 200)
        #expect(path.boundingRect.maxY == 138)
    }

    @Test func familyConnectorSeparatesParentUnionFromChildRail() {
        let geometry = TreeConnector.familyGeometry(
            parents: [CGPoint(x: 0, y: 0), CGPoint(x: 100, y: 0)],
            children: [CGPoint(x: 300, y: 170), CGPoint(x: 400, y: 170)],
            avatarRadius: 32,
            scale: 1
        )

        #expect(geometry?.parentRange == 0...100)
        #expect(geometry?.childRange == 50...400)
        #expect(geometry!.parentJoinY < geometry!.childRailY)
    }

    @Test func familyBranchesCanUseSeparateLanes() {
        let upperPath = TreeConnector.familyPath(
            parents: [CGPoint(x: 0, y: 0)],
            children: [CGPoint(x: 0, y: 170)],
            avatarRadius: 32,
            scale: 1,
            branchOffset: -12
        )
        let lowerPath = TreeConnector.familyPath(
            parents: [CGPoint(x: 200, y: 0)],
            children: [CGPoint(x: 200, y: 170)],
            avatarRadius: 32,
            scale: 1,
            branchOffset: 12
        )

        let upperBranchY = TreeConnector.familyBranchY(
            parents: [CGPoint(x: 0, y: 0)],
            children: [CGPoint(x: 0, y: 170)],
            avatarRadius: 32,
            scale: 1,
            branchOffset: -12
        )
        let lowerBranchY = TreeConnector.familyBranchY(
            parents: [CGPoint(x: 200, y: 0)],
            children: [CGPoint(x: 200, y: 170)],
            avatarRadius: 32,
            scale: 1,
            branchOffset: 12
        )

        #expect(upperBranchY < lowerBranchY)
        let upperGeometry = TreeConnector.familyGeometry(
            parents: [CGPoint(x: 0, y: 0)],
            children: [CGPoint(x: 0, y: 170)],
            avatarRadius: 32,
            scale: 1,
            branchOffset: -12
        )
        let lowerGeometry = TreeConnector.familyGeometry(
            parents: [CGPoint(x: 200, y: 0)],
            children: [CGPoint(x: 200, y: 170)],
            avatarRadius: 32,
            scale: 1,
            branchOffset: 12
        )
        #expect(upperGeometry!.parentJoinY < lowerGeometry!.parentJoinY)
        #expect(upperPath.boundingRect.minX == 0)
        #expect(lowerPath.boundingRect.minX == 200)
    }

    @Test func connectorLanesSeparateOnlyOverlappingFamilySpans() {
        let lanes = TreeConnector.laneIndices(
            for: [0...100, 20...80, 120...200],
            clearance: 10
        )

        #expect(lanes == [0, 1, 0])
    }

    @Test func treeSpacingLeavesRoomForLabelsControlsAndConnectorLanes() {
        #expect(TreeVisualMetrics.horizontalSpacing >= TreeVisualMetrics.nodeLabelWidth + 60)
        #expect(TreeVisualMetrics.generationSpacing >= 250)
    }

    @Test func zoomOffsetKeepsTheGestureAnchorStationary() {
        let offset = TreeViewportTransform.offset(
            afterMagnifying: CGSize(width: 10, height: 20),
            by: 2,
            around: CGPoint(x: 100, y: 100),
            viewportCenter: CGPoint(x: 50, y: 50)
        )

        #expect(offset == CGSize(width: -30, height: -10))
    }

    @Test func overviewRenderingUsesCanonicalZoomHysteresis() {
        #expect(TreeVisualMetrics.shouldRenderOverview(currentlyOverview: false, scale: 0.29))
        #expect(!TreeVisualMetrics.shouldRenderOverview(currentlyOverview: false, scale: 0.3))
        #expect(TreeVisualMetrics.shouldRenderOverview(currentlyOverview: true, scale: 0.41))
        #expect(!TreeVisualMetrics.shouldRenderOverview(currentlyOverview: true, scale: 0.42))
        #expect(TreeVisualMetrics.actionCompensation(at: 0.2) == 1.7)
        #expect(TreeVisualMetrics.actionCompensation(at: 0.5) == 1)
        #expect(TreeVisualMetrics.actionCompensation(at: 1.8) == 1 / 1.8)
    }

    @MainActor
    private func makeContext() throws -> NSManagedObjectContext {
        PersistenceController(inMemory: true).container.viewContext
    }

    private func closePersistentStores(in controller: PersistenceController) throws {
        for store in controller.container.persistentStoreCoordinator.persistentStores {
            try controller.container.persistentStoreCoordinator.remove(store)
        }
    }
}
