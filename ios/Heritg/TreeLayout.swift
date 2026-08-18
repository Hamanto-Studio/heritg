import CoreGraphics
import Foundation

nonisolated struct PersonSnapshot: Identifiable, Equatable, Sendable {
    let id: String
    let name: String
    let gender: PersonGender
    let profilePhotoData: Data?
    let lifeSummary: String?
    let birthDate: Date?

    init(
        id: String,
        name: String,
        gender: PersonGender,
        profilePhotoData: Data? = nil,
        lifeSummary: String? = nil,
        birthDate: Date? = nil
    ) {
        self.id = id
        self.name = name
        self.gender = gender
        self.profilePhotoData = profilePhotoData
        self.lifeSummary = lifeSummary
        self.birthDate = birthDate
    }
}

nonisolated struct RelationshipSnapshot: Identifiable, Equatable, Sendable {
    let id: String
    let fromPersonID: String
    let toPersonID: String
    let kind: RelationshipKind
    let subtype: RelationshipSubtype
    let marriageYear: String?

    init(
        id: String,
        fromPersonID: String,
        toPersonID: String,
        kind: RelationshipKind,
        subtype: RelationshipSubtype? = nil,
        marriageYear: String? = nil
    ) {
        self.id = id
        self.fromPersonID = fromPersonID
        self.toPersonID = toPersonID
        self.kind = kind
        self.subtype = subtype ?? .legacyDefault(for: kind)
        self.marriageYear = marriageYear
    }
}

nonisolated struct TreeNodeLayout: Identifiable, Equatable, Sendable {
    let id: String
    let person: PersonSnapshot
    let role: String
    let position: CGPoint
}

nonisolated struct TreeEdgeLayout: Identifiable, Equatable, Sendable {
    let id: String
    let fromPersonID: String
    let toPersonID: String
    let from: CGPoint
    let to: CGPoint
    let kind: RelationshipKind
    let subtype: RelationshipSubtype
    let marriageYear: String?

    init(
        id: String,
        fromPersonID: String,
        toPersonID: String,
        from: CGPoint,
        to: CGPoint,
        kind: RelationshipKind,
        subtype: RelationshipSubtype? = nil,
        marriageYear: String? = nil
    ) {
        self.id = id
        self.fromPersonID = fromPersonID
        self.toPersonID = toPersonID
        self.from = from
        self.to = to
        self.kind = kind
        self.subtype = subtype ?? .legacyDefault(for: kind)
        self.marriageYear = marriageYear
    }

    var marriageLabel: String? {
        guard kind == .partner else { return nil }
        switch subtype {
        case .spouse:
            if let marriageYear {
                return AppLanguage.localized("Married \(marriageYear)")
            }
            return AppLanguage.localized("Married")
        case .formerSpouse:
            return AppLanguage.localized("Former spouse")
        case .formerPartner:
            return AppLanguage.localized("Former partner")
        default:
            return AppLanguage.localized("Partner")
        }
    }
}

nonisolated struct TreeLayoutResult: Equatable, Sendable {
    let nodes: [TreeNodeLayout]
    let edges: [TreeEdgeLayout]
}

enum TreeLayout {
    static func make(
        focusedPersonID: String?,
        people: [PersonSnapshot],
        relationships: [RelationshipSnapshot]
    ) -> TreeLayoutResult {
        make(
            focusedPersonID: focusedPersonID,
            people: people,
            relationships: relationships,
            selectedPersonID: nil
        )
    }

    static func make(
        focusedPersonID: String?,
        people: [PersonSnapshot],
        relationships: [RelationshipSnapshot],
        selectedPersonID: String?,
        generationLimits: TreeGenerationLimits = .unlimited
    ) -> TreeLayoutResult {
        guard let focusedPersonID else {
            return makeEntireTree(
                people: people,
                relationships: relationships,
                selectedPersonID: selectedPersonID,
                generationLimits: generationLimits
            )
        }

        guard let focused = people.first(where: { $0.id == focusedPersonID }) else {
            return TreeLayoutResult(nodes: [], edges: [])
        }

        let peopleByID = people.reduce(into: [String: PersonSnapshot]()) { result, person in
            result[person.id] = person
        }
        let parents = relationships
            .filter { $0.kind == .parent && $0.toPersonID == focusedPersonID }
            .compactMap { peopleByID[$0.fromPersonID] }
            .sorted(by: familyOrder)
        let children = familyGroupedOrder(
            in: relationships
                .filter { $0.kind == .parent && $0.fromPersonID == focusedPersonID }
                .compactMap { peopleByID[$0.toPersonID] },
            relationships: relationships
        )
        let siblings = relationships
            .filter {
                $0.kind == .sibling &&
                    ($0.fromPersonID == focusedPersonID || $0.toPersonID == focusedPersonID)
            }
            .compactMap { relationship in
                let siblingID = relationship.fromPersonID == focusedPersonID
                    ? relationship.toPersonID
                    : relationship.fromPersonID
                return peopleByID[siblingID]
            }
            .sorted(by: familyOrder)
        let partners = relationships
            .filter {
                $0.kind == .partner &&
                    ($0.fromPersonID == focusedPersonID || $0.toPersonID == focusedPersonID)
            }
            .compactMap { relationship in
                let partnerID = relationship.fromPersonID == focusedPersonID
                    ? relationship.toPersonID
                    : relationship.fromPersonID
                return peopleByID[partnerID]
            }
            .sorted(by: familyOrder)

        var nodes = [TreeNodeLayout(
            id: focused.id,
            person: focused,
            role: AppLanguage.localized("You"),
            position: .zero
        )]
        nodes += rowNodes(
            people: parents,
            roles: roleLabels(for: parents, focusID: focusedPersonID, relationships: relationships),
            y: -TreeVisualMetrics.generationSpacing
        )
        nodes += rowNodes(
            people: children,
            roles: roleLabels(for: children, focusID: focusedPersonID, relationships: relationships),
            y: TreeVisualMetrics.generationSpacing
        )

        for (index, sibling) in siblings.enumerated() {
            nodes.append(TreeNodeLayout(
                id: sibling.id,
                person: sibling,
                role: roleLabels(
                    for: [sibling],
                    focusID: focusedPersonID,
                    relationships: relationships
                )[sibling.id] ?? genderedSiblingLabel(sibling.gender),
                position: CGPoint(x: -CGFloat(index + 1) * TreeVisualMetrics.horizontalSpacing, y: 0)
            ))
        }

        for (index, partner) in partners.enumerated() {
            nodes.append(TreeNodeLayout(
                id: partner.id,
                person: partner,
                role: roleLabels(
                    for: [partner],
                    focusID: focusedPersonID,
                    relationships: relationships
                )[partner.id]
                    ?? AppLanguage.localized("Partner"),
                position: CGPoint(x: CGFloat(index + 1) * TreeVisualMetrics.horizontalSpacing, y: 0)
            ))
        }

        var uniqueNodes: [String: TreeNodeLayout] = [:]
        for node in nodes where uniqueNodes[node.id] == nil {
            uniqueNodes[node.id] = node
        }
        let orderedNodes = nodes.compactMap { uniqueNodes.removeValue(forKey: $0.id) }
        let positions = orderedNodes.reduce(into: [String: CGPoint]()) { result, node in
            result[node.id] = node.position
        }
        let visibleIDs = Set(orderedNodes.map(\.id))
        let edges = relationships.sorted(by: relationshipOrder).compactMap { relationship -> TreeEdgeLayout? in
            guard visibleIDs.contains(relationship.fromPersonID),
                  visibleIDs.contains(relationship.toPersonID),
                  let from = positions[relationship.fromPersonID],
                  let to = positions[relationship.toPersonID] else {
                return nil
            }
            return TreeEdgeLayout(
                id: relationship.id,
                fromPersonID: relationship.fromPersonID,
                toPersonID: relationship.toPersonID,
                from: from,
                to: to,
                kind: relationship.kind,
                subtype: relationship.subtype,
                marriageYear: relationship.marriageYear
            )
        }

        return TreeLayoutResult(nodes: orderedNodes, edges: edges)
    }

    private static func makeEntireTree(
        people: [PersonSnapshot],
        relationships: [RelationshipSnapshot],
        selectedPersonID: String? = nil,
        generationLimits: TreeGenerationLimits = .unlimited
    ) -> TreeLayoutResult {
        let peopleByID = people.reduce(into: [String: PersonSnapshot]()) { result, person in
            result[person.id] = person
        }
        let validPersonIDs = Set(peopleByID.keys)
        let depths = generationDepths(
            people: people,
            relationships: relationships
        )
        let layoutLevels = TreeGenerationFilter.layoutLevels(
            selectedPersonID: selectedPersonID,
            validPersonIDs: validPersonIDs,
            relationships: relationships,
            depths: depths,
            limits: generationLimits
        )
        let visibleIDs = TreeGenerationFilter.visiblePersonIDs(
            selectedPersonID: selectedPersonID,
            validPersonIDs: validPersonIDs,
            relationships: relationships,
            depths: depths,
            limits: generationLimits
        )
        let visiblePeople = people.filter { visibleIDs.contains($0.id) }.sorted(by: stablePersonOrder)

        let visibleDepths = visiblePeople.map { layoutLevels[$0.id] ?? 0 }
        let minDepth = visibleDepths.min() ?? 0
        let maxDepth = visibleDepths.max() ?? 0
        let peopleByDepth = Dictionary(grouping: visiblePeople, by: { layoutLevels[$0.id] ?? 0 })
        let nodes = peopleByDepth
            .keys
            .sorted()
            .flatMap { depth in
                let peopleAtDepth = peopleByDepth[depth] ?? []
                let orderedPeople = familyGroupedOrder(
                    in: peopleAtDepth,
                    relationships: relationships
                )
                let startX = -CGFloat(max(orderedPeople.count - 1, 0)) * TreeVisualMetrics.horizontalSpacing / 2
                return orderedPeople.enumerated().map { index, person in
                    TreeNodeLayout(
                        id: person.id,
                        person: person,
                        role: relationshipInEntireTree(
                            for: person.id,
                            selectedPersonID: selectedPersonID,
                            peopleByID: peopleByID,
                            relationships: relationships
                        ),
                        position: CGPoint(
                            x: startX + CGFloat(index) * TreeVisualMetrics.horizontalSpacing,
                            y: (CGFloat(depth) - CGFloat(minDepth + maxDepth) / 2)
                                * TreeVisualMetrics.generationSpacing
                        )
                    )
                }
            }

        let positions = nodes.reduce(into: [String: CGPoint]()) { result, node in
            result[node.id] = node.position
        }
        let edges = relationships.sorted(by: relationshipOrder).compactMap { relationship -> TreeEdgeLayout? in
            guard let from = positions[relationship.fromPersonID],
                  let to = positions[relationship.toPersonID],
                  peopleByID[relationship.fromPersonID] != nil,
                  peopleByID[relationship.toPersonID] != nil else {
                return nil
            }
            let fromDepth = layoutLevels[relationship.fromPersonID] ?? 0
            let toDepth = layoutLevels[relationship.toPersonID] ?? 0
            if relationship.kind == .parent, toDepth != fromDepth + 1 {
                return nil
            }
            if relationship.kind != .parent, toDepth != fromDepth {
                return nil
            }
            return TreeEdgeLayout(
                id: relationship.id,
                fromPersonID: relationship.fromPersonID,
                toPersonID: relationship.toPersonID,
                from: from,
                to: to,
                kind: relationship.kind,
                subtype: relationship.subtype,
                marriageYear: relationship.marriageYear
            )
        }

        return TreeLayoutResult(nodes: nodes, edges: edges)
    }

    static func availableGenerationLevels(
        selectedPersonID: String?,
        people: [PersonSnapshot],
        relationships: [RelationshipSnapshot]
    ) -> TreeAvailableGenerationLevels {
        let validPersonIDs = Set(people.map(\.id))
        return TreeGenerationFilter.availableLevels(
            selectedPersonID: selectedPersonID,
            validPersonIDs: validPersonIDs,
            relationships: relationships,
            depths: generationDepths(people: people, relationships: relationships)
        )
    }

    private static func generationDepths(
        people: [PersonSnapshot],
        relationships: [RelationshipSnapshot]
    ) -> [String: Int] {
        let validIDs = Set(people.map(\.id))
        var constraints = [String: [(personID: String, offset: Int)]]()

        func addConstraint(_ firstID: String, _ secondID: String, offset: Int) {
            guard validIDs.contains(firstID), validIDs.contains(secondID), firstID != secondID else {
                return
            }
            constraints[firstID, default: []].append((secondID, offset))
            constraints[secondID, default: []].append((firstID, -offset))
        }

        let orderedRelationships = relationships.sorted(by: relationshipOrder)
        for relationship in orderedRelationships {
            addConstraint(
                relationship.fromPersonID,
                relationship.toPersonID,
                offset: relationship.kind == .parent ? 1 : 0
            )
        }

        let parentsByChild = Dictionary(
            grouping: relationships.filter { $0.kind == .parent },
            by: \.toPersonID
        )
        for childID in parentsByChild.keys.sorted() {
            let parentRelationships = parentsByChild[childID, default: []].sorted(by: relationshipOrder)
            guard let firstParentID = parentRelationships.first?.fromPersonID else { continue }
            for relationship in parentRelationships.dropFirst() {
                addConstraint(firstParentID, relationship.fromPersonID, offset: 0)
            }
        }

        let parentedIDs = Set(relationships.compactMap {
            $0.kind == .parent ? $0.toPersonID : nil
        })
        var starts = [String]()
        let orderedPersonIDs = people.map(\.id).sorted()
        starts += orderedPersonIDs.filter { !parentedIDs.contains($0) }
        starts += orderedPersonIDs.filter { !starts.contains($0) }

        for personID in constraints.keys.sorted() {
            constraints[personID]?.sort {
                if $0.personID != $1.personID { return $0.personID < $1.personID }
                return $0.offset < $1.offset
            }
        }

        var depths = [String: Int]()
        for startID in starts where depths[startID] == nil {
            depths[startID] = 0
            var queue = [startID]
            var index = 0

            while index < queue.count {
                let personID = queue[index]
                index += 1
                let depth = depths[personID] ?? 0

                for constraint in constraints[personID, default: []] {
                    guard depths[constraint.personID] == nil else { continue }
                    depths[constraint.personID] = depth + constraint.offset
                    queue.append(constraint.personID)
                }
            }
        }

        return depths
    }

    private static func roleInEntireTree(
        for personID: String,
        relationships: [RelationshipSnapshot]
    ) -> String {
        if relationships.contains(where: { $0.kind == .parent && $0.toPersonID == personID }) {
            return AppLanguage.localized("Child")
        }
        return AppLanguage.localized("Family member")
    }

    private static func familyGroupedOrder(
        in people: [PersonSnapshot],
        relationships: [RelationshipSnapshot]
    ) -> [PersonSnapshot] {
        let peopleByID = Dictionary(uniqueKeysWithValues: people.map { ($0.id, $0) })
        let personIDs = Set(peopleByID.keys)
        let orderedPeople = people.sorted(by: chronologicalOrder)
        var parentIDsByPerson = [String: Set<String>]()
        for relationship in relationships where relationship.kind == .parent &&
            personIDs.contains(relationship.toPersonID) {
            parentIDsByPerson[relationship.toPersonID, default: []].insert(relationship.fromPersonID)
        }
        var partnerIDsByPerson = [String: Set<String>]()
        for relationship in relationships where relationship.kind == .partner {
            guard personIDs.contains(relationship.fromPersonID),
                  personIDs.contains(relationship.toPersonID) else {
                continue
            }
            partnerIDsByPerson[relationship.fromPersonID, default: []].insert(relationship.toPersonID)
            partnerIDsByPerson[relationship.toPersonID, default: []].insert(relationship.fromPersonID)
        }

        var added = Set<String>()
        var units = [(
            groupKey: String,
            anchor: PersonSnapshot,
            members: [PersonSnapshot]
        )]()

        for person in orderedPeople where
            !parentIDsByPerson[person.id, default: []].isEmpty && !added.contains(person.id) {
            var componentIDs: Set<String> = [person.id]
            var queue = [person.id]
            var index = 0
            while index < queue.count {
                let personID = queue[index]
                index += 1
                for partnerID in partnerIDsByPerson[personID, default: []].sorted()
                    where parentIDsByPerson[partnerID, default: []].isEmpty &&
                    !added.contains(partnerID) && componentIDs.insert(partnerID).inserted {
                    queue.append(partnerID)
                }
            }

            added.formUnion(componentIDs)
            let members = orderedPeople.filter { componentIDs.contains($0.id) }
            let orderedMembers = [person] + members
                .filter { $0.id != person.id }
                .sorted(by: chronologicalOrder)
            let parentKey = parentIDsByPerson[person.id, default: []]
                .sorted()
                .joined(separator: "|")
            units.append((
                groupKey: "parents:\(parentKey)",
                anchor: person,
                members: orderedMembers
            ))
        }

        for person in orderedPeople where !added.contains(person.id) {
            var componentIDs: Set<String> = [person.id]
            var queue = [person.id]
            var index = 0
            while index < queue.count {
                let personID = queue[index]
                index += 1
                for partnerID in partnerIDsByPerson[personID, default: []].sorted()
                    where !added.contains(partnerID) && componentIDs.insert(partnerID).inserted {
                    queue.append(partnerID)
                }
            }

            added.formUnion(componentIDs)
            let members = orderedPeople.filter { componentIDs.contains($0.id) }
            guard let anchor = members.min(by: chronologicalOrder) else {
                continue
            }
            let orderedMembers = [anchor] + members
                .filter { $0.id != anchor.id }
                .sorted(by: chronologicalOrder)
            units.append((
                groupKey: "root:\(componentIDs.sorted().joined(separator: "|"))",
                anchor: anchor,
                members: orderedMembers
            ))
        }

        let orderedUnits = units.sorted { lhs, rhs in
            if chronologicalOrder(lhs.anchor, rhs.anchor) { return true }
            if chronologicalOrder(rhs.anchor, lhs.anchor) { return false }
            return lhs.groupKey < rhs.groupKey
        }
        var groupKeys = [String]()
        for unit in orderedUnits where !groupKeys.contains(unit.groupKey) {
            groupKeys.append(unit.groupKey)
        }

        return groupKeys.flatMap { groupKey in
            orderedUnits
                .filter { $0.groupKey == groupKey }
                .sorted { lhs, rhs in
                    if chronologicalOrder(lhs.anchor, rhs.anchor) { return true }
                    if chronologicalOrder(rhs.anchor, lhs.anchor) { return false }
                    return lhs.anchor.id < rhs.anchor.id
                }
                .flatMap(\.members)
        }
    }

    private static func relationshipInEntireTree(
        for personID: String,
        selectedPersonID: String?,
        peopleByID: [String: PersonSnapshot],
        relationships: [RelationshipSnapshot]
    ) -> String {
        guard let selectedPersonID else {
            return roleInEntireTree(for: personID, relationships: relationships)
        }
        if let label = KinshipResolver.label(
            for: personID,
            relativeTo: selectedPersonID,
            people: peopleByID.values.sorted(by: stablePersonOrder),
            relationships: relationships
        ) {
            return label
        }
        guard personID != selectedPersonID else {
            return AppLanguage.localized("You")
        }

        if relationships.contains(where: {
            $0.kind == .partner &&
                Set([$0.fromPersonID, $0.toPersonID]) == Set([selectedPersonID, personID])
        }) {
            return AppLanguage.localized("Partner")
        }

        let ancestors = ancestorDistances(from: selectedPersonID, relationships: relationships)
        if let distance = ancestors[personID], let person = peopleByID[personID] {
            return generationLabel(
                distance: distance,
                gender: person.gender,
                direction: .ancestor
            )
        }

        let descendants = descendantDistances(from: selectedPersonID, relationships: relationships)
        if let distance = descendants[personID], let person = peopleByID[personID] {
            return generationLabel(
                distance: distance,
                gender: person.gender,
                direction: .descendant
            )
        }

        let siblingsOfSelected = siblingIDs(of: selectedPersonID, relationships: relationships)
        if siblingsOfSelected.contains(personID), let person = peopleByID[personID] {
            return gendered(person.gender, male: "Brother", female: "Sister", neutral: "Sibling")
        }

        for (ancestorID, distance) in ancestors.sorted(by: distanceThenID) {
            if siblingIDs(of: ancestorID, relationships: relationships).contains(personID),
               let person = peopleByID[personID] {
                let label = gendered(
                    person.gender,
                    male: "Uncle",
                    female: "Aunt",
                    neutral: "Aunt/Uncle"
                )
                return addingGreatPrefix(to: label, count: max(distance - 1, 0))
            }
        }

        for siblingID in siblingsOfSelected.sorted() {
            let siblingDescendants = descendantDistances(from: siblingID, relationships: relationships)
            if let distance = siblingDescendants[personID],
               let person = peopleByID[personID] {
                let label = gendered(
                    person.gender,
                    male: "Nephew",
                    female: "Niece",
                    neutral: "Niece/Nephew"
                )
                return addingGreatPrefix(to: label, count: max(distance - 1, 0))
            }
        }

        let personAncestors = ancestorDistances(from: personID, relationships: relationships)
        if ancestors.keys.contains(where: { personAncestors[$0] != nil }) {
            return AppLanguage.localized("Cousin")
        }

        return roleInEntireTree(for: personID, relationships: relationships)
    }

    private enum GenerationDirection {
        case ancestor
        case descendant
    }

    private static func generationLabel(
        distance: Int,
        gender: PersonGender,
        direction: GenerationDirection
    ) -> String {
        guard distance > 0 else {
            return AppLanguage.localized("Family member")
        }
        switch direction {
        case .ancestor:
            if distance == 1 {
                return gendered(gender, male: "Father", female: "Mother", neutral: "Parent")
            }
            let label = gendered(
                gender,
                male: "Grandfather",
                female: "Grandmother",
                neutral: "Grandparent"
            )
            return addingGreatPrefix(to: label, count: max(distance - 2, 0))
        case .descendant:
            if distance == 1 {
                return gendered(gender, male: "Son", female: "Daughter", neutral: "Child")
            }
            let label = gendered(
                gender,
                male: "Grandson",
                female: "Granddaughter",
                neutral: "Grandchild"
            )
            return addingGreatPrefix(to: label, count: max(distance - 2, 0))
        }
    }

    private static func addingGreatPrefix(to label: String, count: Int) -> String {
        (0..<count).reduce(label) { current, _ in
            AppLanguage.localized("great-\(current)")
        }
    }

    private static func ancestorDistances(
        from personID: String,
        relationships: [RelationshipSnapshot]
    ) -> [String: Int] {
        distances(from: personID, relationships: relationships, followsParent: true)
    }

    private static func descendantDistances(
        from personID: String,
        relationships: [RelationshipSnapshot]
    ) -> [String: Int] {
        distances(from: personID, relationships: relationships, followsParent: false)
    }

    private static func distances(
        from personID: String,
        relationships: [RelationshipSnapshot],
        followsParent: Bool
    ) -> [String: Int] {
        var result = [String: Int]()
        var queue = [(personID, 0)]
        var index = 0

        while index < queue.count {
            let (currentID, distance) = queue[index]
            index += 1
            for relationship in relationships.sorted(by: relationshipOrder) where relationship.kind == .parent {
                let nextID: String?
                if followsParent, relationship.toPersonID == currentID {
                    nextID = relationship.fromPersonID
                } else if !followsParent, relationship.fromPersonID == currentID {
                    nextID = relationship.toPersonID
                } else {
                    nextID = nil
                }
                guard let nextID, result[nextID] == nil else { continue }
                result[nextID] = distance + 1
                queue.append((nextID, distance + 1))
            }
        }
        return result
    }

    private static func siblingIDs(
        of personID: String,
        relationships: [RelationshipSnapshot]
    ) -> Set<String> {
        let parentIDs = Set(relationships.compactMap { relationship in
            relationship.kind == .parent && relationship.toPersonID == personID
                ? relationship.fromPersonID
                : nil
        })
        return Set(relationships.compactMap { relationship in
            guard relationship.kind == .parent,
                  parentIDs.contains(relationship.fromPersonID),
                  relationship.toPersonID != personID else { return nil }
            return relationship.toPersonID
        })
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

    private static func rowNodes(
        people: [PersonSnapshot],
        roles: [String: String],
        y: CGFloat
    ) -> [TreeNodeLayout] {
        let spacing: CGFloat = 170
        let startX = -CGFloat(max(people.count - 1, 0)) * spacing / 2
        return people.enumerated().map { index, person in
            TreeNodeLayout(
                id: person.id,
                person: person,
                role: roles[person.id]
                    ?? AppLanguage.localized("Family"),
                position: CGPoint(x: startX + CGFloat(index) * spacing, y: y)
            )
        }
    }

    private static func roleLabels(
        for people: [PersonSnapshot],
        focusID: String,
        relationships: [RelationshipSnapshot]
    ) -> [String: String] {
        people.reduce(into: [:]) { labels, person in
            guard let relationship = relationships.sorted(by: relationshipOrder).first(where: {
                ($0.fromPersonID == person.id && $0.toPersonID == focusID) ||
                    ($0.toPersonID == person.id && $0.fromPersonID == focusID)
            }) else { return }
            labels[person.id] = FamilyRoleLabel.label(
                relativeGender: person.gender,
                relationshipKind: relationship.kind,
                focusedPersonID: focusID,
                fromPersonID: relationship.fromPersonID,
                toPersonID: relationship.toPersonID,
                relationshipSubtype: relationship.subtype
            )
        }
    }

    private static func genderedSiblingLabel(_ gender: PersonGender) -> String {
        switch gender {
        case .male: AppLanguage.localized("Brother")
        case .female: AppLanguage.localized("Sister")
        case .unspecified: AppLanguage.localized("Sibling")
        }
    }

    nonisolated private static func familyOrder(
        _ lhs: PersonSnapshot,
        _ rhs: PersonSnapshot
    ) -> Bool {
        let genderOrder: [PersonGender: Int] = [.male: 0, .female: 1, .unspecified: 2]
        let lhsOrder = genderOrder[lhs.gender, default: 2]
        let rhsOrder = genderOrder[rhs.gender, default: 2]
        if lhsOrder != rhsOrder { return lhsOrder < rhsOrder }
        let lhsName = lhs.name.lowercased()
        let rhsName = rhs.name.lowercased()
        if lhsName != rhsName { return lhsName < rhsName }
        if lhs.name != rhs.name { return lhs.name < rhs.name }
        return lhs.id < rhs.id
    }

    nonisolated private static func chronologicalOrder(
        _ lhs: PersonSnapshot,
        _ rhs: PersonSnapshot
    ) -> Bool {
        switch (lhs.birthDate, rhs.birthDate) {
        case let (lhsDate?, rhsDate?) where lhsDate != rhsDate:
            return lhsDate < rhsDate
        case (_?, nil):
            return true
        case (nil, _?):
            return false
        default:
            return familyOrder(lhs, rhs)
        }
    }

    nonisolated private static func stablePersonOrder(
        _ lhs: PersonSnapshot,
        _ rhs: PersonSnapshot
    ) -> Bool {
        if familyOrder(lhs, rhs) { return true }
        if familyOrder(rhs, lhs) { return false }
        return lhs.id < rhs.id
    }

    nonisolated private static func relationshipOrder(
        _ lhs: RelationshipSnapshot,
        _ rhs: RelationshipSnapshot
    ) -> Bool {
        let kindOrder: [RelationshipKind: Int] = [.parent: 0, .partner: 1, .sibling: 2]
        let lhsKind = kindOrder[lhs.kind, default: 3]
        let rhsKind = kindOrder[rhs.kind, default: 3]
        if lhsKind != rhsKind { return lhsKind < rhsKind }
        if lhs.fromPersonID != rhs.fromPersonID { return lhs.fromPersonID < rhs.fromPersonID }
        if lhs.toPersonID != rhs.toPersonID { return lhs.toPersonID < rhs.toPersonID }
        if lhs.subtype.rawValue != rhs.subtype.rawValue { return lhs.subtype.rawValue < rhs.subtype.rawValue }
        return lhs.id < rhs.id
    }

    nonisolated private static func distanceThenID(
        _ lhs: Dictionary<String, Int>.Element,
        _ rhs: Dictionary<String, Int>.Element
    ) -> Bool {
        if lhs.value != rhs.value { return lhs.value < rhs.value }
        return lhs.key < rhs.key
    }
}
