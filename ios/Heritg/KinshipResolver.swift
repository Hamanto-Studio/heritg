import Foundation

enum KinshipResolver {
    static func label(
        for personID: String,
        relativeTo referenceID: String,
        people: [PersonSnapshot],
        relationships: [RelationshipSnapshot]
    ) -> String? {
        guard personID != referenceID else {
            return AppLanguage.localized("You")
        }
        let peopleByID = Dictionary(uniqueKeysWithValues: people.map { ($0.id, $0) })
        guard let person = peopleByID[personID], peopleByID[referenceID] != nil else { return nil }

        if let direct = directLabel(
            for: person,
            relativeTo: referenceID,
            relationships: relationships
        ) {
            return direct
        }
        if let lineage = lineageLabel(
            for: person,
            relativeTo: referenceID,
            peopleByID: peopleByID,
            relationships: relationships
        ) {
            return lineage
        }
        if let step = stepLabel(
            for: person,
            relativeTo: referenceID,
            peopleByID: peopleByID,
            relationships: relationships
        ) {
            return step
        }
        return inLawLabel(
            for: person,
            relativeTo: referenceID,
            peopleByID: peopleByID,
            relationships: relationships
        )
    }

    private static func directLabel(
        for person: PersonSnapshot,
        relativeTo referenceID: String,
        relationships: [RelationshipSnapshot]
    ) -> String? {
        guard let relationship = relationships.first(where: {
            ($0.fromPersonID == person.id && $0.toPersonID == referenceID) ||
                ($0.toPersonID == person.id && $0.fromPersonID == referenceID)
        }) else { return nil }
        return FamilyRoleLabel.label(
            relativeGender: person.gender,
            relationshipKind: relationship.kind,
            focusedPersonID: referenceID,
            fromPersonID: relationship.fromPersonID,
            toPersonID: relationship.toPersonID,
            relationshipSubtype: relationship.subtype
        )
    }

    private static func lineageLabel(
        for person: PersonSnapshot,
        relativeTo referenceID: String,
        peopleByID: [String: PersonSnapshot],
        relationships: [RelationshipSnapshot]
    ) -> String? {
        let personAncestors = ancestorDistances(from: person.id, relationships: relationships)
        let referenceAncestors = ancestorDistances(from: referenceID, relationships: relationships)

        if let distance = referenceAncestors[person.id] {
            return generationLabel(distance: distance, gender: person.gender, ancestor: true)
        }
        if let distance = personAncestors[referenceID] {
            return generationLabel(distance: distance, gender: person.gender, ancestor: false)
        }

        let common = Set(personAncestors.keys).intersection(referenceAncestors.keys)
        guard let closest = common.min(by: {
            let lhs = (max(personAncestors[$0]!, referenceAncestors[$0]!), personAncestors[$0]! + referenceAncestors[$0]!)
            let rhs = (max(personAncestors[$1]!, referenceAncestors[$1]!), personAncestors[$1]! + referenceAncestors[$1]!)
            return lhs < rhs
        }) else { return nil }
        let personDistance = personAncestors[closest]!
        let referenceDistance = referenceAncestors[closest]!

        if personDistance == 1, referenceDistance == 1 {
            return gendered(person.gender, male: "Brother", female: "Sister", neutral: "Sibling")
        }
        if personDistance == 1 {
            let base = gendered(person.gender, male: "Uncle", female: "Aunt", neutral: "Aunt/Uncle")
            return addingGreatPrefix(to: base, count: max(referenceDistance - 2, 0))
        }
        if referenceDistance == 1 {
            let base = gendered(person.gender, male: "Nephew", female: "Niece", neutral: "Niece/Nephew")
            return addingGreatPrefix(to: base, count: max(personDistance - 2, 0))
        }
        return cousinLabel(
            degree: min(personDistance, referenceDistance) - 1,
            removal: abs(personDistance - referenceDistance)
        )
    }

    private static func stepLabel(
        for person: PersonSnapshot,
        relativeTo referenceID: String,
        peopleByID: [String: PersonSnapshot],
        relationships: [RelationshipSnapshot]
    ) -> String? {
        let referenceParents = parentIDs(of: referenceID, relationships: relationships)
        if referenceParents.contains(where: { activePartners(of: $0, relationships: relationships).contains(person.id) }) {
            return gendered(person.gender, male: "Stepfather", female: "Stepmother", neutral: "Step-parent")
        }
        let referencePartners = activePartners(of: referenceID, relationships: relationships)
        if referencePartners.contains(where: { parentIDs(of: person.id, relationships: relationships).contains($0) }) {
            return gendered(person.gender, male: "Stepson", female: "Stepdaughter", neutral: "Stepchild")
        }
        for parentID in referenceParents {
            for stepParentID in activePartners(of: parentID, relationships: relationships) {
                if parentIDs(of: person.id, relationships: relationships).contains(stepParentID) {
                    return gendered(person.gender, male: "Stepbrother", female: "Stepsister", neutral: "Stepsibling")
                }
            }
        }
        return nil
    }

    private static func inLawLabel(
        for person: PersonSnapshot,
        relativeTo referenceID: String,
        peopleByID: [String: PersonSnapshot],
        relationships: [RelationshipSnapshot]
    ) -> String? {
        let referencePartners = activePartners(of: referenceID, relationships: relationships)
        if referencePartners.contains(where: { parentIDs(of: $0, relationships: relationships).contains(person.id) }) {
            return gendered(person.gender, male: "Father-in-law", female: "Mother-in-law", neutral: "Parent-in-law")
        }
        let referenceChildren = childIDs(of: referenceID, relationships: relationships)
        if referenceChildren.contains(where: { activePartners(of: $0, relationships: relationships).contains(person.id) }) {
            return gendered(person.gender, male: "Son-in-law", female: "Daughter-in-law", neutral: "Child-in-law")
        }
        if referencePartners.contains(where: { areSiblings(person.id, $0, relationships: relationships) }) ||
            activePartners(of: person.id, relationships: relationships).contains(where: {
                areSiblings($0, referenceID, relationships: relationships)
            }) {
            return gendered(person.gender, male: "Brother-in-law", female: "Sister-in-law", neutral: "Sibling-in-law")
        }

        for partnerID in referencePartners {
            if let label = lineageLabel(
                for: person,
                relativeTo: partnerID,
                peopleByID: peopleByID,
                relationships: relationships
            ) {
                return AppLanguage.localized("\(label) by marriage")
            }
        }
        return nil
    }

    private static func ancestorDistances(
        from personID: String,
        relationships: [RelationshipSnapshot]
    ) -> [String: Int] {
        var result = [String: Int]()
        var queue = [(personID, 0)]
        var index = 0
        while index < queue.count {
            let (currentID, distance) = queue[index]
            index += 1
            for relationship in relationships where relationship.kind == .parent &&
                relationship.subtype.contributesToAncestry && relationship.toPersonID == currentID {
                guard relationship.fromPersonID != personID,
                      result[relationship.fromPersonID] == nil else { continue }
                result[relationship.fromPersonID] = distance + 1
                queue.append((relationship.fromPersonID, distance + 1))
            }
        }
        return result
    }

    private static func parentIDs(
        of personID: String,
        relationships: [RelationshipSnapshot]
    ) -> Set<String> {
        Set(relationships.compactMap {
            $0.kind == .parent && $0.subtype.contributesToAncestry && $0.toPersonID == personID
                ? $0.fromPersonID : nil
        })
    }

    private static func childIDs(
        of personID: String,
        relationships: [RelationshipSnapshot]
    ) -> Set<String> {
        Set(relationships.compactMap {
            $0.kind == .parent && $0.subtype.contributesToAncestry && $0.fromPersonID == personID
                ? $0.toPersonID : nil
        })
    }

    private static func activePartners(
        of personID: String,
        relationships: [RelationshipSnapshot]
    ) -> Set<String> {
        Set(relationships.compactMap {
            guard $0.kind == .partner, $0.subtype.isActiveUnion else { return nil }
            if $0.fromPersonID == personID { return $0.toPersonID }
            if $0.toPersonID == personID { return $0.fromPersonID }
            return nil
        })
    }

    private static func areSiblings(
        _ firstID: String,
        _ secondID: String,
        relationships: [RelationshipSnapshot]
    ) -> Bool {
        if relationships.contains(where: {
            $0.kind == .sibling && Set([$0.fromPersonID, $0.toPersonID]) == Set([firstID, secondID])
        }) { return true }
        return !parentIDs(of: firstID, relationships: relationships)
            .isDisjoint(with: parentIDs(of: secondID, relationships: relationships))
    }

    private static func generationLabel(distance: Int, gender: PersonGender, ancestor: Bool) -> String {
        if distance == 1 {
            return ancestor
                ? gendered(gender, male: "Father", female: "Mother", neutral: "Parent")
                : gendered(gender, male: "Son", female: "Daughter", neutral: "Child")
        }
        let base = ancestor
            ? gendered(gender, male: "Grandfather", female: "Grandmother", neutral: "Grandparent")
            : gendered(gender, male: "Grandson", female: "Granddaughter", neutral: "Grandchild")
        return addingGreatPrefix(to: base, count: max(distance - 2, 0))
    }

    private static func cousinLabel(degree: Int, removal: Int) -> String {
        let base: String
        switch degree {
        case 1: base = AppLanguage.localized("First cousin")
        case 2: base = AppLanguage.localized("Second cousin")
        case 3: base = AppLanguage.localized("Third cousin")
        default:
            base = AppLanguage.localized("\(degree)th cousin")
        }
        switch removal {
        case 0: return base
        case 1:
            return AppLanguage.localized("\(base) once removed")
        case 2:
            return AppLanguage.localized("\(base) twice removed")
        default:
            return AppLanguage.localized("\(base) \(removal) times removed")
        }
    }

    private static func addingGreatPrefix(to label: String, count: Int) -> String {
        (0..<count).reduce(label) { current, _ in
            AppLanguage.localized("great-\(current)")
        }
    }

    private static func gendered(
        _ gender: PersonGender,
        male: String.LocalizationValue,
        female: String.LocalizationValue,
        neutral: String.LocalizationValue
    ) -> String {
        switch gender {
        case .male: AppLanguage.localized(male)
        case .female: AppLanguage.localized(female)
        case .unspecified: AppLanguage.localized(neutral)
        }
    }
}
