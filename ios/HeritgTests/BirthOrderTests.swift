import CoreData
import Foundation
import Testing
@testable import HERITG

struct BirthOrderTests {
    @Test func parserAcceptsOnlyPositiveSafeIntegers() throws {
        #expect(try ChildOrder.parse("") == nil)
        #expect(try ChildOrder.parse("  \n") == nil)
        #expect(try ChildOrder.parse("1") == 1)
        #expect(try ChildOrder.parse(" \(ChildOrder.maximum) ") == ChildOrder.maximum)

        for invalid in ["0", "-1", "1.5", "1e2", "\(ChildOrder.maximum + 1)", String(repeating: "9", count: 30)] {
            #expect(throws: FamilyGraphError.self) {
                try ChildOrder.parse(invalid)
            }
        }
    }

    @Test func labelsUseTheRequestedLocale() {
        #expect(ChildOrder.localizedLabel(for: 1, locale: Locale(identifier: "en")) ==
            "First child")
        #expect(ChildOrder.localizedLabel(for: 22, locale: Locale(identifier: "en")) ==
            "22nd child")
        #expect(ChildOrder.localizedLabel(for: 1, locale: Locale(identifier: "id")) ==
            "Anak pertama")
        #expect(ChildOrder.localizedLabel(for: 4, locale: Locale(identifier: "id")) ==
            "Anak ke-4")
    }

    @MainActor
    @Test func invalidCreationDoesNotLeaveAPendingPerson() throws {
        let context = PersistenceController(inMemory: true).container.viewContext
        let tree = try FamilyGraph.createTree(named: "Family", in: context)
        var invalid = PersonDetails.empty
        invalid.birthOrderOverride = 0

        #expect(throws: FamilyGraphError.self) {
            try FamilyGraph.createPerson(
                named: "Ghost",
                in: tree,
                details: invalid,
                context: context
            )
        }
        #expect(context.insertedObjects.isEmpty)
        #expect(try context.count(for: Person.fetchRequest()) == 0)
    }

    @MainActor
    @Test func graphPersistsMaximumOrderAndAllowsClearingIt() throws {
        let context = PersistenceController(inMemory: true).container.viewContext
        let tree = try FamilyGraph.createTree(named: "Family", in: context)
        var details = PersonDetails.empty
        details.birthDatePrecision = .year
        details.birthOrderOverride = ChildOrder.maximum
        let person = try FamilyGraph.createPerson(
            named: "Child",
            in: tree,
            details: details,
            context: context
        )

        #expect(person.birthOrderOverrideValue == ChildOrder.maximum)
        details.birthOrderOverride = nil
        try FamilyGraph.update(
            person,
            name: person.displayName,
            gender: person.gender,
            details: details,
            in: context
        )
        #expect(person.birthOrderOverrideValue == nil)
        #expect(person.birthDatePrecision == .year)
    }

    @Test func manualOrderChangesBadgesWithoutMovingPeople() throws {
        let relationships = biologicalFamilyRelationships()
        let automaticPeople = familyPeople()
        let manualPeople = familyPeople(firstOverride: 2, secondOverride: 1)

        for focusedPersonID in [String?.none, "parent-a"] {
            let automatic = TreeLayout.make(
                focusedPersonID: focusedPersonID,
                people: automaticPeople,
                relationships: relationships
            )
            let manual = TreeLayout.make(
                focusedPersonID: focusedPersonID,
                people: manualPeople,
                relationships: relationships
            )

            #expect(coordinates(automatic) == coordinates(manual))
            #expect(automatic.edges == manual.edges)
            #expect(try #require(automatic.nodes.first { $0.id == "child-a" }).birthOrder == 1)
            #expect(try #require(automatic.nodes.first { $0.id == "child-b" }).birthOrder == 2)
            #expect(try #require(manual.nodes.first { $0.id == "child-a" }).birthOrder == 2)
            #expect(try #require(manual.nodes.first { $0.id == "child-b" }).birthOrder == 1)
        }
    }

    @Test func uncertainOrMissingDatesRequireManualOrder() throws {
        let relationships = biologicalFamilyRelationships()
        var people = familyPeople()
        people[2] = person("child-a", birthDate: date(2000, 1, 1), precision: .year)
        people[3] = person("child-b", birthDate: date(2000, 12, 31))

        let uncertain = TreeLayout.make(
            focusedPersonID: nil,
            people: people,
            relationships: relationships
        )
        #expect(try #require(uncertain.nodes.first { $0.id == "child-a" }).birthOrder == nil)
        #expect(try #require(uncertain.nodes.first { $0.id == "child-b" }).birthOrder == nil)

        people[2] = person("child-a", birthOrderOverride: 1)
        people[3] = person("child-b", birthOrderOverride: 1)
        let manual = TreeLayout.make(
            focusedPersonID: nil,
            people: people,
            relationships: relationships
        )
        #expect(try #require(manual.nodes.first { $0.id == "child-a" }).birthOrder == 1)
        #expect(try #require(manual.nodes.first { $0.id == "child-b" }).birthOrder == 1)
    }

    private func familyPeople(
        firstOverride: Int? = nil,
        secondOverride: Int? = nil
    ) -> [PersonSnapshot] {
        [
            person("parent-a"),
            person("parent-b"),
            person("child-a", birthDate: date(2000, 1, 1), birthOrderOverride: firstOverride),
            person("child-b", birthDate: date(2001, 1, 1), birthOrderOverride: secondOverride),
        ]
    }

    private func biologicalFamilyRelationships() -> [RelationshipSnapshot] {
        [
            parent("parent-a", "child-a", id: "a-1"),
            parent("parent-b", "child-a", id: "b-1"),
            parent("parent-a", "child-b", id: "a-2"),
            parent("parent-b", "child-b", id: "b-2"),
        ]
    }

    private func person(
        _ id: String,
        birthDate: Date? = nil,
        precision: BirthDatePrecision = .exact,
        birthOrderOverride: Int? = nil
    ) -> PersonSnapshot {
        PersonSnapshot(
            id: id,
            name: id,
            gender: .unspecified,
            birthDate: birthDate,
            birthDatePrecision: precision,
            birthOrderOverride: birthOrderOverride
        )
    }

    private func parent(_ from: String, _ to: String, id: String) -> RelationshipSnapshot {
        RelationshipSnapshot(
            id: id,
            fromPersonID: from,
            toPersonID: to,
            kind: .parent,
            subtype: .biologicalParent
        )
    }

    private func date(_ year: Int, _ month: Int, _ day: Int) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        return calendar.date(from: DateComponents(
            year: year,
            month: month,
            day: day,
            hour: 12
        ))!
    }

    private func coordinates(_ layout: TreeLayoutResult) -> [String: CGPoint] {
        Dictionary(uniqueKeysWithValues: layout.nodes.map { ($0.id, $0.position) })
    }
}
