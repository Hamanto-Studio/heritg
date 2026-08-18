import CoreGraphics
import SwiftUI
import Testing
@testable import HERITG

@MainActor
struct TreeGenerationLimitTests {
    @Test func unlimitedLimitsPreserveTheEntireTree() {
        let fixture = linearFixture()
        let existingLayout = TreeLayout.make(
            focusedPersonID: nil,
            people: fixture.people,
            relationships: fixture.relationships,
            selectedPersonID: "focus"
        )
        let unlimitedLayout = TreeLayout.make(
            focusedPersonID: nil,
            people: fixture.people,
            relationships: fixture.relationships,
            selectedPersonID: "focus",
            generationLimits: .unlimited
        )

        #expect(unlimitedLayout == existingLayout)
    }

    @Test func ancestorLimitKeepsOnlyTheRequestedLevelsAbove() {
        let fixture = linearFixture()
        let expectedIDs: [Int: Set<String>] = [
            0: ["focus", "d1", "d2", "d3"],
            1: ["a1", "focus", "d1", "d2", "d3"],
            2: ["a2", "a1", "focus", "d1", "d2", "d3"],
        ]

        for level in 0...2 {
            let layout = makeLayout(
                fixture,
                limits: TreeGenerationLimits(ancestorLevels: level, descendantLevels: nil)
            )
            #expect(Set(layout.nodes.map(\.id)) == expectedIDs[level])
            expectEveryEdgeIsVisible(in: layout)
        }
    }

    @Test func descendantLimitKeepsOnlyTheRequestedLevelsBelow() {
        let fixture = linearFixture()
        let expectedIDs: [Int: Set<String>] = [
            0: ["a3", "a2", "a1", "focus"],
            1: ["a3", "a2", "a1", "focus", "d1"],
            2: ["a3", "a2", "a1", "focus", "d1", "d2"],
        ]

        for level in 0...2 {
            let layout = makeLayout(
                fixture,
                limits: TreeGenerationLimits(ancestorLevels: nil, descendantLevels: level)
            )
            #expect(Set(layout.nodes.map(\.id)) == expectedIDs[level])
            expectEveryEdgeIsVisible(in: layout)
        }
    }

    @Test func zeroLimitsKeepConnectedPeopleOnTheSelectedLevel() {
        let people = ["parent", "focus", "partner", "sibling", "child"].map {
            PersonSnapshot(id: $0, name: $0, gender: .unspecified)
        }
        let relationships = [
            RelationshipSnapshot(id: "parent", fromPersonID: "parent", toPersonID: "focus", kind: .parent),
            RelationshipSnapshot(id: "partner", fromPersonID: "focus", toPersonID: "partner", kind: .partner),
            RelationshipSnapshot(id: "sibling", fromPersonID: "focus", toPersonID: "sibling", kind: .sibling),
            RelationshipSnapshot(id: "child", fromPersonID: "focus", toPersonID: "child", kind: .parent),
        ]

        let layout = TreeLayout.make(
            focusedPersonID: nil,
            people: people,
            relationships: relationships,
            selectedPersonID: "focus",
            generationLimits: TreeGenerationLimits(ancestorLevels: 0, descendantLevels: 0)
        )

        #expect(Set(layout.nodes.map(\.id)) == ["focus", "partner", "sibling"])
        #expect(Set(layout.edges.map(\.id)) == ["partner", "sibling"])
    }

    @Test func availableLevelsUseTheFullSelectedComponent() {
        var fixture = linearFixture()
        fixture.people += (0...4).map {
            PersonSnapshot(id: "unrelated\($0)", name: "unrelated\($0)", gender: .unspecified)
        }
        fixture.relationships += (0..<4).map {
            RelationshipSnapshot(
                id: "unrelated-edge\($0)",
                fromPersonID: "unrelated\($0)",
                toPersonID: "unrelated\($0 + 1)",
                kind: .parent
            )
        }

        let levels = TreeLayout.availableGenerationLevels(
            selectedPersonID: "focus",
            people: fixture.people,
            relationships: fixture.relationships
        )

        #expect(levels == TreeAvailableGenerationLevels(ancestorLevels: 3, descendantLevels: 3))
        #expect(levels.hasAny)
    }

    @Test func unavailableDirectionsAndMissingSelectionAreReported() {
        let fixture = linearFixture()
        let rootLevels = TreeLayout.availableGenerationLevels(
            selectedPersonID: "a3",
            people: fixture.people,
            relationships: fixture.relationships
        )
        let leafLevels = TreeLayout.availableGenerationLevels(
            selectedPersonID: "d3",
            people: fixture.people,
            relationships: fixture.relationships
        )
        let noSelectionLevels = TreeLayout.availableGenerationLevels(
            selectedPersonID: nil,
            people: fixture.people,
            relationships: fixture.relationships
        )

        #expect(rootLevels == TreeAvailableGenerationLevels(ancestorLevels: 0, descendantLevels: 6))
        #expect(leafLevels == TreeAvailableGenerationLevels(ancestorLevels: 6, descendantLevels: 0))
        #expect(noSelectionLevels == .none)
        #expect(!noSelectionLevels.hasAny)
    }

    @Test func finiteLimitsWithoutASelectionDoNotHidePeople() {
        let fixture = linearFixture()
        let layout = TreeLayout.make(
            focusedPersonID: nil,
            people: fixture.people,
            relationships: fixture.relationships,
            selectedPersonID: nil,
            generationLimits: TreeGenerationLimits(ancestorLevels: 0, descendantLevels: 0)
        )

        #expect(Set(layout.nodes.map(\.id)) == Set(fixture.people.map(\.id)))
    }

    @Test func directRelationshipsDetermineDirectionInAParentCycle() {
        let people = ["a", "b", "c"].map {
            PersonSnapshot(id: $0, name: $0, gender: .unspecified)
        }
        let relationships = [
            RelationshipSnapshot(id: "ab", fromPersonID: "a", toPersonID: "b", kind: .parent),
            RelationshipSnapshot(id: "bc", fromPersonID: "b", toPersonID: "c", kind: .parent),
            RelationshipSnapshot(id: "ca", fromPersonID: "c", toPersonID: "a", kind: .parent),
        ]
        let availableLevels = TreeLayout.availableGenerationLevels(
            selectedPersonID: "b",
            people: people,
            relationships: relationships
        )
        let layout = TreeLayout.make(
            focusedPersonID: nil,
            people: people,
            relationships: relationships,
            selectedPersonID: "b",
            generationLimits: TreeGenerationLimits(ancestorLevels: 0, descendantLevels: 1)
        )

        #expect(availableLevels == TreeAvailableGenerationLevels(ancestorLevels: 1, descendantLevels: 1))
        #expect(Set(layout.nodes.map(\.id)) == ["b", "c"])
        #expect(
            layout.nodes.first(where: { $0.id == "c" })!.position.y
                == layout.nodes.first(where: { $0.id == "b" })!.position.y
        )
        #expect(layout.edges.isEmpty)
    }

    @Test func limitsClampToAChangedSelectionMaximum() {
        let limits = TreeGenerationLimits(ancestorLevels: 6, descendantLevels: 4)

        #expect(limits.clamped(to: .none) == .unlimited)
        #expect(
            limits.clamped(to: TreeAvailableGenerationLevels(ancestorLevels: 2, descendantLevels: 1))
                == TreeGenerationLimits(ancestorLevels: 2, descendantLevels: 1)
        )
    }

    @Test func filteredLayoutRendersForPNGExport() {
        let layout = makeLayout(
            linearFixture(),
            limits: TreeGenerationLimits(ancestorLevels: 2, descendantLevels: 1)
        )
        let renderer = ImageRenderer(
            content: TreeExportView(layout: layout).frame(width: 1200, height: 1200)
        )

        #expect(Set(layout.nodes.map(\.id)) == ["a2", "a1", "focus", "d1"])
        #expect(renderer.uiImage?.pngData()?.isEmpty == false)
    }

    private func linearFixture() -> (people: [PersonSnapshot], relationships: [RelationshipSnapshot]) {
        let ids = ["a3", "a2", "a1", "focus", "d1", "d2", "d3"]
        let people = ids.map { PersonSnapshot(id: $0, name: $0, gender: .unspecified) }
        let relationships = zip(ids, ids.dropFirst()).enumerated().map { index, pair in
            RelationshipSnapshot(
                id: "edge\(index)",
                fromPersonID: pair.0,
                toPersonID: pair.1,
                kind: .parent
            )
        }
        return (people, relationships)
    }

    private func makeLayout(
        _ fixture: (people: [PersonSnapshot], relationships: [RelationshipSnapshot]),
        limits: TreeGenerationLimits
    ) -> TreeLayoutResult {
        TreeLayout.make(
            focusedPersonID: nil,
            people: fixture.people,
            relationships: fixture.relationships,
            selectedPersonID: "focus",
            generationLimits: limits
        )
    }

    private func expectEveryEdgeIsVisible(in layout: TreeLayoutResult) {
        let visibleIDs = Set(layout.nodes.map(\.id))
        #expect(layout.edges.allSatisfy {
            visibleIDs.contains($0.fromPersonID) && visibleIDs.contains($0.toPersonID)
        })
    }
}
