import CoreGraphics
import Foundation
import Testing
@testable import HERITG

struct TreeLayoutDeterminismTests {
    @MainActor
    @Test func localeSortedPermutationsDoNotChangeCoordinatesOrRouteOrdering() {
        let people = [
            person("root", "Root"),
            person("parent-b", "Ipek", gender: .male),
            person("parent-a", "ipek", gender: .male),
            person("parent-c", "İpek", gender: .male),
            person("parent-d", "ıpek", gender: .male),
            person("child-b", "Same", birth: 200),
            person("child-a", "Same", birth: 200),
            person("partner", "Partner", birth: 100),
        ]
        let relationships = [
            parent("root", "parent-a", id: "r1"),
            parent("root", "parent-b", id: "r2"),
            parent("root", "parent-c", id: "r3"),
            parent("root", "parent-d", id: "r4"),
            parent("parent-a", "child-a", id: "r5"),
            parent("parent-b", "child-a", id: "r6"),
            parent("parent-a", "child-b", id: "r7"),
            parent("parent-b", "child-b", id: "r8"),
            RelationshipSnapshot(
                id: "r9",
                fromPersonID: "child-b",
                toPersonID: "partner",
                kind: .partner
            ),
        ]
        let englishPeople = localeOrder(people, locale: Locale(identifier: "en_US"))
        let turkishPeople = localeOrder(people, locale: Locale(identifier: "tr_TR"))
        #expect(englishPeople.map(\.id) != turkishPeople.map(\.id))

        let baseline = TreeLayout.make(
            focusedPersonID: nil,
            people: englishPeople,
            relationships: relationships,
            selectedPersonID: "child-a"
        )
        let permuted = TreeLayout.make(
            focusedPersonID: nil,
            people: turkishPeople,
            relationships: Array(relationships.reversed()),
            selectedPersonID: "child-a"
        )

        #expect(coordinates(baseline) == coordinates(permuted))
        #expect(baseline.nodes.map(\.id) == permuted.nodes.map(\.id))
        #expect(baseline.edges.map(\.id) == permuted.edges.map(\.id))
        #expect(baseline.edges.map { "\($0.fromPersonID)|\($0.toPersonID)" } ==
            permuted.edges.map { "\($0.fromPersonID)|\($0.toPersonID)" })
        #expect(TreeConnectionPlan.make(from: baseline) == TreeConnectionPlan.make(from: permuted))
    }

    @Test func focusedLayoutIsIndependentOfInputOrder() {
        let people = [
            person("focus", "Focus"),
            person("parent-b", "Same", gender: .male),
            person("parent-a", "Same", gender: .male),
            person("child-b", "Same"),
            person("child-a", "Same"),
        ]
        let relationships = [
            parent("parent-b", "focus", id: "parent-b"),
            parent("parent-a", "focus", id: "parent-a"),
            parent("focus", "child-b", id: "child-b"),
            parent("focus", "child-a", id: "child-a"),
        ]

        let baseline = TreeLayout.make(focusedPersonID: "focus", people: people, relationships: relationships)
        let permuted = TreeLayout.make(
            focusedPersonID: "focus",
            people: Array(people.reversed()),
            relationships: Array(relationships.reversed())
        )

        #expect(coordinates(baseline) == coordinates(permuted))
        #expect(baseline.nodes.map(\.id) == permuted.nodes.map(\.id))
        #expect(baseline.edges.map(\.id) == permuted.edges.map(\.id))
    }

    private func coordinates(_ layout: TreeLayoutResult) -> [String: CGPoint] {
        Dictionary(uniqueKeysWithValues: layout.nodes.map { ($0.id, $0.position) })
    }

    private func localeOrder(_ people: [PersonSnapshot], locale: Locale) -> [PersonSnapshot] {
        people.sorted { lhs, rhs in
            let comparison = lhs.name.compare(rhs.name, options: [.caseInsensitive], locale: locale)
            if comparison != .orderedSame { return comparison == .orderedAscending }
            return lhs.id < rhs.id
        }
    }

    private func person(
        _ id: String,
        _ name: String,
        gender: PersonGender = .unspecified,
        birth: TimeInterval? = nil
    ) -> PersonSnapshot {
        PersonSnapshot(
            id: id,
            name: name,
            gender: gender,
            birthDate: birth.map(Date.init(timeIntervalSince1970:))
        )
    }

    private func parent(_ from: String, _ to: String, id: String) -> RelationshipSnapshot {
        RelationshipSnapshot(id: id, fromPersonID: from, toPersonID: to, kind: .parent)
    }
}
