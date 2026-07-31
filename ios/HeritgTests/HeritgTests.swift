//
//  HeritgTests.swift
//  HeritgTests
//
//  Created by Hamanto Studio on 28/07/26.
//

import CoreGraphics
import SwiftData
import SwiftUI
import Testing
import UIKit
@testable import HERITG

struct HeritgTests {
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

        let savedPerson = try #require(context.fetch(FetchDescriptor<Person>()).first)
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
        let relationships = try context.fetch(FetchDescriptor<FamilyRelationship>())

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
        let relationships = try context.fetch(FetchDescriptor<FamilyRelationship>())

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
        let relationships = try context.fetch(FetchDescriptor<FamilyRelationship>())

        try FamilyGraph.deletePerson(child, relationships: relationships, in: context)

        #expect(try context.fetchCount(FetchDescriptor<Person>()) == 1)
        #expect(try context.fetchCount(FetchDescriptor<FamilyRelationship>()) == 0)
    }

    @MainActor
    @Test func savesPersonAndRelationshipDraftTogether() throws {
        let context = try makeContext()
        let tree = try FamilyGraph.createTree(named: "Rina Family", in: context)
        let person = try FamilyGraph.createPerson(named: "Rina", in: tree, context: context)
        _ = try FamilyGraph.addRelative(named: "Nina", to: person, as: .daughter, in: context)
        let sibling = try FamilyGraph.createPerson(named: "Dina", in: tree, context: context)
        let existingRelationships = try context.fetch(FetchDescriptor<FamilyRelationship>())
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

        let savedRelationships = try context.fetch(FetchDescriptor<FamilyRelationship>())
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
        let remainingPeople = try context.fetch(FetchDescriptor<Person>())
        #expect(remainingPeople.map(\.id) == [secondPerson.id])
    }

    @MainActor
    @Test func importsGEDCOMAsANewScopedTree() throws {
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
        let tree = try FamilyGraph.importGEDCOM(parsed, in: context)
        let importedPeople = try context.fetch(FetchDescriptor<Person>())
        let importedRelationships = try context.fetch(FetchDescriptor<FamilyRelationship>())

        #expect(tree.title == "Rina-Family")
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

    @MainActor
    @Test func addControlUsesAnUnoccupiedCardinalSide() {
        let center = CGPoint(x: 100, y: 100)
        let cases: [(occupied: Set<TreeNodeSide>, expected: TreeNodeSide)] = [
            ([], .left),
            ([.left], .right),
            ([.top, .bottom], .left),
            ([.left, .right], .top),
            ([.left, .right, .top, .bottom], .topLeft),
        ]

        for testCase in cases {
            let side = TreeVisualMetrics.addControlSide(avoiding: testCase.occupied)
            let position = TreeVisualMetrics.addControlPosition(
                avatarCenter: center,
                scale: 1,
                side: side
            )

            #expect(side == testCase.expected)
            #expect(!testCase.occupied.contains(side))
            if side == .topLeft || side == .topRight {
                #expect(position.x != center.x && position.y != center.y)
            } else {
                #expect(position.x == center.x || position.y == center.y)
            }
            if side == .left || side == .right {
                #expect(abs(position.x - center.x) == 66)
            }
        }
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

    @MainActor
    private func makeContext() throws -> ModelContext {
        let schema = Schema([FamilyTree.self, Person.self, FamilyRelationship.self])
        let configuration = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        let container = try ModelContainer(for: schema, configurations: [configuration])
        return ModelContext(container)
    }
}
