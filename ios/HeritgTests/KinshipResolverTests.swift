import Foundation
import Testing
@testable import HERITG

struct KinshipResolverTests {
    @MainActor
    @Test func gedcomRoundTripPreservesAdoptiveParentage() throws {
        let parent = Person(id: "parent", displayName: "Parent")
        let child = Person(id: "child", displayName: "Child")
        let relationship = FamilyRelationship(
            fromPersonID: parent.id,
            toPersonID: child.id,
            kind: .parent,
            subtype: .adoptiveParent
        )

        let exported = GEDCOMExporter.export(people: [parent, child], relationships: [relationship])
        let imported = try GEDCOMImporter.parse(data: Data(exported.utf8), sourceName: "family.ged")

        #expect(imported.relationships.count == 1)
        #expect(imported.relationships.first?.subtype == .adoptiveParent)
    }

    @Test func labelsExplicitCareAndSiblingRelationships() {
        let people = [
            person("focus"),
            person("adoptiveMother", gender: .female),
            person("fosterSon", gender: .male),
            person("halfSister", gender: .female),
        ]
        let relationships = [
            parent("adoptiveMother", "focus", subtype: .adoptiveParent),
            parent("focus", "fosterSon", subtype: .fosterParent),
            relation("focus", "halfSister", kind: .sibling, subtype: .halfSibling),
        ]

        #expect(label("adoptiveMother", to: "focus", people, relationships) == AppLanguage.localized("Adoptive mother"))
        #expect(label("fosterSon", to: "focus", people, relationships) == AppLanguage.localized("Foster son"))
        #expect(label("halfSister", to: "focus", people, relationships) == AppLanguage.localized("Half-sister"))
    }

    @Test func derivesStandardInLawRelationships() {
        let people = [
            person("focus"), person("spouse"),
            person("mother", gender: .female), person("child"),
            person("childSpouse", gender: .male), person("sibling", gender: .female),
        ]
        let relationships = [
            relation("focus", "spouse", kind: .partner, subtype: .spouse),
            parent("mother", "spouse"),
            parent("focus", "child"),
            relation("child", "childSpouse", kind: .partner, subtype: .spouse),
            relation("spouse", "sibling", kind: .sibling, subtype: .sibling),
        ]

        #expect(label("mother", to: "focus", people, relationships) == AppLanguage.localized("Mother-in-law"))
        #expect(label("childSpouse", to: "focus", people, relationships) == AppLanguage.localized("Son-in-law"))
        #expect(label("sibling", to: "focus", people, relationships) == AppLanguage.localized("Sister-in-law"))
    }

    @Test func derivesStepRelationshipsOnlyThroughActiveUnions() {
        let people = [
            person("focus"), person("parent"), person("stepfather", gender: .male),
            person("stepchild", gender: .female), person("formerPartner"),
        ]
        let relationships = [
            parent("parent", "focus"),
            relation("parent", "stepfather", kind: .partner, subtype: .spouse),
            parent("stepfather", "stepchild"),
            relation("parent", "formerPartner", kind: .partner, subtype: .formerPartner),
        ]

        #expect(label("stepfather", to: "focus", people, relationships) == AppLanguage.localized("Stepfather"))
        #expect(label("stepchild", to: "focus", people, relationships) == AppLanguage.localized("Stepsister"))
        #expect(label("formerPartner", to: "focus", people, relationships) == nil)
    }

    @Test func calculatesCousinDegreeAndRemoval() {
        let people = ["ancestor", "leftGrandparent", "leftParent", "focus",
                      "rightGrandparent", "rightParent", "cousin", "cousinChild"]
            .map { person($0) }
        let relationships = [
            parent("ancestor", "leftGrandparent"),
            parent("leftGrandparent", "leftParent"),
            parent("leftParent", "focus"),
            parent("ancestor", "rightGrandparent"),
            parent("rightGrandparent", "rightParent"),
            parent("rightParent", "cousin"),
            parent("cousin", "cousinChild"),
        ]

        let secondCousin = AppLanguage.localized("Second cousin")
        #expect(label("cousin", to: "focus", people, relationships) == secondCousin)
        #expect(label("cousinChild", to: "focus", people, relationships) == AppLanguage.localized("\(secondCousin) once removed"))
    }

    @Test func adoptionContributesToKinshipButFosterCareDoesNot() {
        let people = ["grandparent", "leftParent", "rightParent", "focus", "adoptiveCousin", "fosterChild"]
            .map { person($0) }
        let relationships = [
            parent("grandparent", "leftParent"),
            parent("grandparent", "rightParent"),
            parent("leftParent", "focus"),
            parent("rightParent", "adoptiveCousin", subtype: .adoptiveParent),
            parent("rightParent", "fosterChild", subtype: .fosterParent),
        ]

        #expect(label("adoptiveCousin", to: "focus", people, relationships) == AppLanguage.localized("First cousin"))
        #expect(label("fosterChild", to: "focus", people, relationships) == nil)
    }

    private func person(_ id: String, gender: PersonGender = .unspecified) -> PersonSnapshot {
        PersonSnapshot(id: id, name: id, gender: gender)
    }

    private func parent(
        _ parentID: String,
        _ childID: String,
        subtype: RelationshipSubtype = .biologicalParent
    ) -> RelationshipSnapshot {
        relation(parentID, childID, kind: .parent, subtype: subtype)
    }

    private func relation(
        _ firstID: String,
        _ secondID: String,
        kind: RelationshipKind,
        subtype: RelationshipSubtype
    ) -> RelationshipSnapshot {
        RelationshipSnapshot(
            id: "\(kind.rawValue)-\(firstID)-\(secondID)",
            fromPersonID: firstID,
            toPersonID: secondID,
            kind: kind,
            subtype: subtype
        )
    }

    private func label(
        _ personID: String,
        to referenceID: String,
        _ people: [PersonSnapshot],
        _ relationships: [RelationshipSnapshot]
    ) -> String? {
        KinshipResolver.label(
            for: personID,
            relativeTo: referenceID,
            people: people,
            relationships: relationships
        )
    }
}
