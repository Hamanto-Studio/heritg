import CoreData
import Testing
@testable import HERITG

struct PersonRelationshipEditTests {
    @MainActor
    @Test func savingEditedParentAndChildRolesPreservesDirectionAndRole() throws {
        let cases: [(focusIsParent: Bool, subtype: RelationshipSubtype, expectedRole: RelativeRole)] = [
            (true, .fosterParent, .fosterDaughter),
            (false, .adoptiveParent, .adoptiveMother),
        ]

        for testCase in cases {
            let context = try makeContext()
            let tree = try FamilyGraph.createTree(named: "Family", in: context)
            let parent = try FamilyGraph.createPerson(named: "Parent", in: tree, context: context)
            let child = try FamilyGraph.createPerson(named: "Child", in: tree, context: context)
            parent.gender = .female
            child.gender = .female
            let relationship = FamilyRelationship(
                treeID: tree.id,
                fromPersonID: parent.id,
                toPersonID: child.id,
                kind: .parent,
                subtype: testCase.subtype
            )
            context.insert(relationship)
            try context.save()

            let focus = testCase.focusIsParent ? parent : child
            let relative = testCase.focusIsParent ? child : parent
            let editedRole = PersonSheet.relationshipEditRole(
                relationship: relationship,
                relative: relative,
                focusedPersonID: focus.id
            )
            #expect(editedRole == testCase.expectedRole)

            try FamilyGraph.update(
                focus,
                name: focus.displayName,
                gender: focus.gender,
                details: .empty,
                deleting: [relationship],
                linking: [(relative, editedRole, nil)],
                relationships: [relationship],
                in: context
            )

            let saved = try #require(context.fetch(FamilyRelationship.fetchRequest()).first)
            #expect(saved.fromPersonID == parent.id)
            #expect(saved.toPersonID == child.id)
            #expect(saved.subtype == testCase.subtype)
        }
    }

    @MainActor
    private func makeContext() throws -> NSManagedObjectContext {
        PersistenceController(inMemory: true).container.viewContext
    }
}
