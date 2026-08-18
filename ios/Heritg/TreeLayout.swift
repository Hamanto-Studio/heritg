import CoreGraphics
import Foundation

nonisolated struct PersonSnapshot: Identifiable, Equatable, Sendable {
    let id: String
    let name: String
    let gender: PersonGender
    let profilePhotoData: Data?
    let lifeSummary: String?
    let city: String
    let birthDate: Date?
    let birthDatePrecision: BirthDatePrecision

    init(
        id: String,
        name: String,
        gender: PersonGender,
        profilePhotoData: Data? = nil,
        lifeSummary: String? = nil,
        city: String = "",
        birthDate: Date? = nil,
        birthDatePrecision: BirthDatePrecision = .exact
    ) {
        self.id = id
        self.name = name
        self.gender = gender
        self.profilePhotoData = profilePhotoData
        self.lifeSummary = lifeSummary
        self.city = city
        self.birthDate = birthDate
        self.birthDatePrecision = birthDatePrecision
    }
}

nonisolated struct RelationshipSnapshot: Identifiable, Equatable, Sendable {
    let id: String
    let fromPersonID: String
    let toPersonID: String
    let kind: RelationshipKind
    let subtype: RelationshipSubtype
    let marriageDate: Date?
    let marriageYear: String?

    init(
        id: String,
        fromPersonID: String,
        toPersonID: String,
        kind: RelationshipKind,
        subtype: RelationshipSubtype? = nil,
        marriageDate: Date? = nil,
        marriageYear: String? = nil
    ) {
        self.id = id
        self.fromPersonID = fromPersonID
        self.toPersonID = toPersonID
        self.kind = kind
        self.subtype = subtype ?? .legacyDefault(for: kind)
        self.marriageDate = marriageDate
        self.marriageYear = marriageYear
    }
}

nonisolated struct TreeNodeLayout: Identifiable, Equatable, Sendable {
    let id: String
    let person: PersonSnapshot
    let role: String
    let position: CGPoint
    let birthOrder: Int?

    init(
        id: String,
        person: PersonSnapshot,
        role: String,
        position: CGPoint,
        birthOrder: Int? = nil
    ) {
        self.id = id
        self.person = person
        self.role = role
        self.position = position
        self.birthOrder = birthOrder
    }
}

nonisolated struct TreeEdgeLayout: Identifiable, Equatable, Sendable {
    let id: String
    let fromPersonID: String
    let toPersonID: String
    let from: CGPoint
    let to: CGPoint
    let kind: RelationshipKind
    let subtype: RelationshipSubtype
    let marriageDate: Date?
    let marriageYear: String?

    init(
        id: String,
        fromPersonID: String,
        toPersonID: String,
        from: CGPoint,
        to: CGPoint,
        kind: RelationshipKind,
        subtype: RelationshipSubtype? = nil,
        marriageDate: Date? = nil,
        marriageYear: String? = nil
    ) {
        self.id = id
        self.fromPersonID = fromPersonID
        self.toPersonID = toPersonID
        self.from = from
        self.to = to
        self.kind = kind
        self.subtype = subtype ?? .legacyDefault(for: kind)
        self.marriageDate = marriageDate
        self.marriageYear = marriageYear
    }

    var marriageLabel: String? {
        guard kind == .partner else { return nil }
        switch subtype {
        case .spouse:
            if let marriageDate {
                let formatter = DateFormatter()
                formatter.locale = AppLanguage.selectedLocale
                formatter.setLocalizedDateFormatFromTemplate("dMMMy")
                return AppLanguage.localized("Married \(formatter.string(from: marriageDate))")
            }
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

    static let empty = TreeLayoutResult(nodes: [], edges: [])
}

nonisolated enum TreeLayout {
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
        guard !Task.isCancelled else { return .empty }
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
                marriageDate: relationship.marriageDate,
                marriageYear: relationship.marriageYear
            )
        }

        return TreeLayoutResult(nodes: orderedNodes, edges: edges)
    }

    static func updatingRelationshipLabels(
        in layout: TreeLayoutResult,
        selectedPersonID: String?,
        people: [PersonSnapshot],
        relationships: [RelationshipSnapshot]
    ) -> TreeLayoutResult {
        let orderedPeople = people.sorted(by: stablePersonOrder)
        let peopleByID = Dictionary(uniqueKeysWithValues: orderedPeople.map { ($0.id, $0) })
        var nodes = [TreeNodeLayout]()
        nodes.reserveCapacity(layout.nodes.count)

        for node in layout.nodes {
            guard !Task.isCancelled else { return .empty }
            nodes.append(TreeNodeLayout(
                id: node.id,
                person: node.person,
                role: relationshipInEntireTree(
                    for: node.id,
                    selectedPersonID: selectedPersonID,
                    people: orderedPeople,
                    peopleByID: peopleByID,
                    relationships: relationships
                ),
                position: node.position,
                birthOrder: node.birthOrder
            ))
        }

        return TreeLayoutResult(nodes: nodes, edges: layout.edges)
    }

    private static func makeEntireTree(
        people: [PersonSnapshot],
        relationships: [RelationshipSnapshot],
        selectedPersonID: String? = nil,
        generationLimits: TreeGenerationLimits = .unlimited
    ) -> TreeLayoutResult {
        guard !Task.isCancelled else { return .empty }
        let orderedPeople = normalizedPeople(people)
        let validPersonIDs = Set(orderedPeople.map(\.id))
        let orderedRelationships = normalizedRelationships(
            relationships,
            validPersonIDs: validPersonIDs
        )
        let peopleByID = Dictionary(uniqueKeysWithValues: orderedPeople.map { ($0.id, $0) })
        let depths = generationDepths(
            people: orderedPeople,
            relationships: orderedRelationships
        )
        guard !Task.isCancelled else { return .empty }
        let visibleIDs = TreeGenerationFilter.visiblePersonIDs(
            selectedPersonID: selectedPersonID,
            validPersonIDs: validPersonIDs,
            relationships: orderedRelationships,
            depths: depths,
            limits: generationLimits
        )
        guard !Task.isCancelled else { return .empty }
        let visiblePeople = orderedPeople.filter { visibleIDs.contains($0.id) }
        guard !visiblePeople.isEmpty else {
            return TreeLayoutResult(nodes: [], edges: [])
        }

        let peopleByDepth = Dictionary(grouping: visiblePeople) { depths[$0.id] ?? 0 }
        let birthOrders = deriveBirthOrders(
            people: orderedPeople,
            relationships: orderedRelationships
        )
        let rowDepths = peopleByDepth.keys.sorted()
        let minimumDepth = rowDepths[0]
        var positioned = [String: PositionedPerson]()
        var resultPersonIDs = [String]()
        var blocksByDepth = [Int: [RowBlock]]()

        for depth in rowDepths {
            guard !Task.isCancelled else { return .empty }
            let blocks = orderRow(
                people: peopleByDepth[depth] ?? [],
                relationships: orderedRelationships,
                positioned: positioned
            )
            blocksByDepth[depth] = blocks
            let personCount = blocks.reduce(0) { $0 + $1.members.count }
            let familyGapCount = blocks.indices.dropFirst().reduce(0) { count, index in
                count + (needsFamilyGap(blocks[index - 1], blocks[index]) ? 1 : 0)
            }
            let rowWidth = CGFloat(max(personCount - 1, 0)) * TreeVisualMetrics.horizontalSpacing
                + CGFloat(familyGapCount) * TreeVisualMetrics.familyGap
            var nextX: CGFloat? = depth == minimumDepth ? -rowWidth / 2 : nil

            for (blockIndex, block) in blocks.enumerated() {
                let gap = blockIndex > 0 && needsFamilyGap(blocks[blockIndex - 1], block)
                    ? TreeVisualMetrics.familyGap
                    : 0
                let minimumX = nextX.map { $0 + gap }
                let parentX = block.parentX.isFinite ? block.parentX : minimumX ?? 0
                var x = minimumX.map { max(parentX, $0) } ?? parentX

                for person in block.members {
                    positioned[person.id] = PositionedPerson(
                        person: person,
                        role: relationshipInEntireTree(
                            for: person.id,
                            selectedPersonID: selectedPersonID,
                            people: orderedPeople,
                            peopleByID: peopleByID,
                            relationships: orderedRelationships
                        ),
                        generation: depth,
                        x: x,
                        y: CGFloat(depth - minimumDepth) * TreeVisualMetrics.generationSpacing
                    )
                    resultPersonIDs.append(person.id)
                    x += TreeVisualMetrics.horizontalSpacing
                }
                nextX = x
            }
        }

        // Wide descendant branches pull their parents apart exactly as they do on Web.
        if rowDepths.count > 1 {
            for rowIndex in stride(from: rowDepths.count - 2, through: 0, by: -1) {
                guard !Task.isCancelled else { return .empty }
                let depth = rowDepths[rowIndex]
                let blocks = blocksByDepth[depth] ?? []
                var nextX: CGFloat?

                for (blockIndex, block) in blocks.enumerated() {
                    guard !Task.isCancelled else { return .empty }
                    let memberIDs = Set(block.members.map(\.id))
                    let directChildren = orderedRelationships.compactMap { relationship -> PositionedPerson? in
                        guard !Task.isCancelled else { return nil }
                        guard relationship.kind == .parent,
                              memberIDs.contains(relationship.fromPersonID),
                              let child = positioned[relationship.toPersonID],
                              child.generation > depth else {
                            return nil
                        }
                        return child
                    }
                    let nearestChildDepth = directChildren.map(\.generation).min()
                    let childXs = directChildren.compactMap { child in
                        child.generation == nearestChildDepth ? child.x : nil
                    }
                    let currentMembers = block.members.compactMap { positioned[$0.id] }
                    guard let firstMember = currentMembers.first,
                          let lastMember = currentMembers.last else {
                        continue
                    }
                    let desiredCenter = childXs.isEmpty
                        ? (firstMember.x + lastMember.x) / 2
                        : ((childXs.min() ?? 0) + (childXs.max() ?? 0)) / 2
                    let desiredStart = desiredCenter
                        - CGFloat(currentMembers.count - 1) * TreeVisualMetrics.horizontalSpacing / 2
                    let gap = blockIndex > 0 && needsFamilyGap(blocks[blockIndex - 1], block)
                        ? TreeVisualMetrics.familyGap
                        : 0
                    let minimumX = nextX.map { $0 + gap } ?? desiredStart
                    let startX = max(desiredStart, minimumX)
                    let shift = startX - firstMember.x
                    for person in currentMembers {
                        positioned[person.person.id]?.x += shift
                    }
                    nextX = startX + CGFloat(currentMembers.count) * TreeVisualMetrics.horizontalSpacing
                }

                guard blocks.count > 1 else { continue }
                for blockIndex in stride(from: blocks.count - 2, through: 0, by: -1) {
                    guard !Task.isCancelled else { return .empty }
                    let block = blocks[blockIndex]
                    let nextBlock = blocks[blockIndex + 1]
                    guard !block.familyKeys.isDisjoint(with: nextBlock.familyKeys) else { continue }
                    let memberIDs = Set(block.members.map(\.id))
                    let hasDirectDescendants = orderedRelationships.contains { relationship in
                        relationship.kind == .parent
                            && memberIDs.contains(relationship.fromPersonID)
                            && (positioned[relationship.toPersonID]?.generation ?? depth) > depth
                    }
                    guard !hasDirectDescendants,
                          let firstMember = block.members.first.flatMap({ positioned[$0.id] }),
                          let nextStart = nextBlock.members.first.flatMap({ positioned[$0.id]?.x }) else {
                        continue
                    }
                    let gap = needsFamilyGap(block, nextBlock) ? TreeVisualMetrics.familyGap : 0
                    let compactStart = nextStart - gap
                        - CGFloat(block.members.count) * TreeVisualMetrics.horizontalSpacing
                    let shift = compactStart - firstMember.x
                    guard shift > 0 else { continue }
                    for person in block.members {
                        positioned[person.id]?.x += shift
                    }
                }
            }
        }

        let nodes = resultPersonIDs.compactMap { personID -> TreeNodeLayout? in
            guard !Task.isCancelled else { return nil }
            guard let person = positioned[personID] else { return nil }
            return TreeNodeLayout(
                id: personID,
                person: person.person,
                role: person.role,
                position: CGPoint(x: person.x, y: person.y),
                birthOrder: birthOrders[personID]
            )
        }

        let positions = nodes.reduce(into: [String: CGPoint]()) { result, node in
            result[node.id] = node.position
        }
        let edges = orderedRelationships.compactMap { relationship -> TreeEdgeLayout? in
            guard !Task.isCancelled else { return nil }
            guard let from = positions[relationship.fromPersonID],
                  let to = positions[relationship.toPersonID] else {
                return nil
            }
            let fromDepth = depths[relationship.fromPersonID] ?? 0
            let toDepth = depths[relationship.toPersonID] ?? 0
            if relationship.kind == .parent, toDepth <= fromDepth {
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
                marriageDate: relationship.marriageDate,
                marriageYear: relationship.marriageYear
            )
        }

        guard !Task.isCancelled else { return .empty }
        return TreeLayoutResult(nodes: nodes, edges: edges)
    }

    static func availableGenerationLevels(
        selectedPersonID: String?,
        people: [PersonSnapshot],
        relationships: [RelationshipSnapshot]
    ) -> TreeAvailableGenerationLevels {
        guard !Task.isCancelled else { return .none }
        let orderedPeople = normalizedPeople(people)
        let validPersonIDs = Set(orderedPeople.map(\.id))
        let orderedRelationships = normalizedRelationships(
            relationships,
            validPersonIDs: validPersonIDs
        )
        return TreeGenerationFilter.availableLevels(
            selectedPersonID: selectedPersonID,
            validPersonIDs: validPersonIDs,
            relationships: orderedRelationships,
            depths: generationDepths(people: orderedPeople, relationships: orderedRelationships)
        )
    }

    private static func generationDepths(
        people: [PersonSnapshot],
        relationships: [RelationshipSnapshot]
    ) -> [String: Int] {
        let personIDs = people.map(\.id)
        var groups = StableGroups(ids: personIDs)
        for relationship in relationships where relationship.kind != .parent {
            guard !Task.isCancelled else { return [:] }
            groups.union(relationship.fromPersonID, relationship.toPersonID)
        }

        let parentsByChild = Dictionary(
            grouping: relationships.filter { $0.kind == .parent },
            by: \.toPersonID
        )
        for parentRelationships in parentsByChild.values {
            let parentIDs = Set(parentRelationships.map(\.fromPersonID)).sorted(by: textPrecedes)
            guard let firstParentID = parentIDs.first else { continue }
            for parentID in parentIDs.dropFirst() {
                groups.union(firstParentID, parentID)
            }
        }

        let components = groups.values()
        var outgoing = [String: Set<String>]()
        var indegrees = Dictionary(uniqueKeysWithValues: components.keys.map { ($0, 0) })
        for relationship in relationships where relationship.kind == .parent {
            let from = groups.find(relationship.fromPersonID)
            let to = groups.find(relationship.toPersonID)
            guard from != to, outgoing[from, default: []].insert(to).inserted else { continue }
            indegrees[to, default: 0] += 1
        }

        var levels = Dictionary(uniqueKeysWithValues: components.keys.map { ($0, 0) })
        var queue = components.keys.filter { indegrees[$0] == 0 }.sorted(by: textPrecedes)
        var index = 0
        while index < queue.count {
            guard !Task.isCancelled else { return [:] }
            let current = queue[index]
            let children = outgoing[current, default: []].sorted(by: textPrecedes)
            for child in children {
                levels[child] = max(levels[child] ?? 0, (levels[current] ?? 0) + 1)
                indegrees[child, default: 1] -= 1
                if indegrees[child] == 0 {
                    queue.append(child)
                    let tailStart = index + 1
                    if tailStart < queue.count {
                        let sortedTail = queue[tailStart...].sorted(by: textPrecedes)
                        queue.replaceSubrange(tailStart..<queue.count, with: sortedTail)
                    }
                }
            }
            index += 1
        }

        for current in queue.reversed() {
            let childLevels = outgoing[current, default: []].compactMap { levels[$0] }
            guard let minimumChildLevel = childLevels.min() else { continue }
            levels[current] = max(levels[current] ?? 0, minimumChildLevel - 1)
        }

        return Dictionary(uniqueKeysWithValues: personIDs.map {
            ($0, levels[groups.find($0)] ?? 0)
        })
    }

    private struct PositionedPerson {
        let person: PersonSnapshot
        let role: String
        let generation: Int
        var x: CGFloat
        let y: CGFloat
    }

    private struct RowBlock {
        let members: [PersonSnapshot]
        let familyKeys: Set<String>
        let parentX: CGFloat
        let key: String
    }

    private struct StableGroups {
        private var parents: [String: String]

        init(ids: some Sequence<String>) {
            parents = Dictionary(uniqueKeysWithValues: ids.map { ($0, $0) })
        }

        mutating func find(_ id: String) -> String {
            let parent = parents[id] ?? id
            guard parent != id else {
                parents[id] = id
                return id
            }
            let root = find(parent)
            parents[id] = root
            return root
        }

        mutating func union(_ firstID: String, _ secondID: String) {
            let firstRoot = find(firstID)
            let secondRoot = find(secondID)
            guard firstRoot != secondRoot else { return }
            if textPrecedes(firstRoot, secondRoot) {
                parents[secondRoot] = firstRoot
            } else {
                parents[firstRoot] = secondRoot
            }
        }

        mutating func values() -> [String: [String]] {
            var result = [String: [String]]()
            for id in parents.keys.sorted(by: textPrecedes) {
                result[find(id), default: []].append(id)
            }
            return result
        }
    }

    private static func normalizedPeople(_ people: [PersonSnapshot]) -> [PersonSnapshot] {
        var seen = Set<String>()
        return people
            .filter { !$0.id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            .sorted(by: stablePersonOrder)
            .filter { seen.insert($0.id).inserted }
    }

    private static func normalizedRelationships(
        _ relationships: [RelationshipSnapshot],
        validPersonIDs: Set<String>
    ) -> [RelationshipSnapshot] {
        var seen = Set<String>()
        return relationships
            .filter {
                !$0.id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    && $0.fromPersonID != $0.toPersonID
                    && validPersonIDs.contains($0.fromPersonID)
                    && validPersonIDs.contains($0.toPersonID)
            }
            .sorted(by: relationshipOrder)
            .filter { seen.insert($0.id).inserted }
    }

    private static func orderRow(
        people: [PersonSnapshot],
        relationships: [RelationshipSnapshot],
        positioned: [String: PositionedPerson]
    ) -> [RowBlock] {
        guard !Task.isCancelled else { return [] }
        let rowIDs = Set(people.map(\.id))
        var groups = StableGroups(ids: rowIDs)
        for relationship in relationships where relationship.kind == .partner
            && rowIDs.contains(relationship.fromPersonID)
            && rowIDs.contains(relationship.toPersonID) {
            guard !Task.isCancelled else { return [] }
            groups.union(relationship.fromPersonID, relationship.toPersonID)
        }

        var coParentsByChild = [String: [RelationshipSnapshot]]()
        for relationship in relationships {
            guard !Task.isCancelled else { return [] }
            if relationship.kind == .parent, rowIDs.contains(relationship.fromPersonID) {
                coParentsByChild[relationship.toPersonID, default: []].append(relationship)
            }
        }
        for coParentRelationships in coParentsByChild.values {
            guard !Task.isCancelled else { return [] }
            let coParentIDs = Set(coParentRelationships.map(\.fromPersonID)).sorted(by: textPrecedes)
            guard let firstID = coParentIDs.first else { continue }
            for coParentID in coParentIDs.dropFirst() {
                groups.union(firstID, coParentID)
            }
        }

        let peopleByID = Dictionary(uniqueKeysWithValues: people.map { ($0.id, $0) })
        var blocks = [RowBlock]()
        for ids in groups.values().values {
            guard !Task.isCancelled else { return [] }
            var members = ids.compactMap { peopleByID[$0] }
            let memberIDs = Set(members.map(\.id))
            var parentRelationships = [RelationshipSnapshot]()
            var parentIDsByChild = [String: [String]]()
            var parentXsByChild = [String: [CGFloat]]()
            for relationship in relationships {
                guard !Task.isCancelled else { return [] }
                if relationship.kind == .parent, memberIDs.contains(relationship.toPersonID) {
                    parentRelationships.append(relationship)
                    parentIDsByChild[relationship.toPersonID, default: []]
                        .append(relationship.fromPersonID)
                    if let parentX = positioned[relationship.fromPersonID]?.x {
                        parentXsByChild[relationship.toPersonID, default: []].append(parentX)
                    }
                }
            }
            func memberParentX(_ personID: String) -> CGFloat {
                let values = parentXsByChild[personID, default: []]
                guard !values.isEmpty else { return .infinity }
                return values.reduce(0, +) / CGFloat(values.count)
            }
            guard !Task.isCancelled else { return [] }
            members.sort { left, right in
                let leftParentX = memberParentX(left.id)
                let rightParentX = memberParentX(right.id)
                if leftParentX != rightParentX { return leftParentX < rightParentX }
                return stablePersonOrder(left, right)
            }

            let stableRank = Dictionary(uniqueKeysWithValues: members.enumerated().map {
                ($0.element.id, $0.offset)
            })
            var partnerGroups = StableGroups(ids: memberIDs)
            var partnerDegree = [String: Int]()
            for relationship in relationships where relationship.kind == .partner
                && memberIDs.contains(relationship.fromPersonID)
                && memberIDs.contains(relationship.toPersonID) {
                guard !Task.isCancelled else { return [] }
                partnerGroups.union(relationship.fromPersonID, relationship.toPersonID)
                partnerDegree[relationship.fromPersonID, default: 0] += 1
                partnerDegree[relationship.toPersonID, default: 0] += 1
            }
            var partnerComponents = partnerGroups.values().values.map { ids in
                ids.compactMap { peopleByID[$0] }.sorted {
                    stableRank[$0.id, default: 0] < stableRank[$1.id, default: 0]
                }
            }
            partnerComponents.sort {
                guard let left = $0.first, let right = $1.first else { return !$0.isEmpty }
                return stableRank[left.id, default: 0] < stableRank[right.id, default: 0]
            }
            members = partnerComponents.flatMap { component -> [PersonSnapshot] in
                let hub = component.min { left, right in
                    let leftDegree = partnerDegree[left.id, default: 0]
                    let rightDegree = partnerDegree[right.id, default: 0]
                    if leftDegree != rightDegree { return leftDegree > rightDegree }
                    return stableRank[left.id, default: 0] < stableRank[right.id, default: 0]
                }
                guard let hub, partnerDegree[hub.id, default: 0] > 1 else { return component }
                var ordered = component.filter { $0.id != hub.id }
                ordered.insert(hub, at: (ordered.count + 1) / 2)
                return ordered
            }

            let memberIndex = Dictionary(uniqueKeysWithValues: members.enumerated().map {
                ($0.element.id, $0.offset)
            })
            let parentPositions = parentRelationships.compactMap { relationship -> CGFloat? in
                guard let parentX = positioned[relationship.fromPersonID]?.x,
                      let childIndex = memberIndex[relationship.toPersonID] else {
                    return nil
                }
                return parentX - CGFloat(childIndex) * TreeVisualMetrics.horizontalSpacing
            }
            let familyKeys = Set(members.compactMap { person -> String? in
                let parentIDs = parentIDsByChild[person.id, default: []].sorted(by: textPrecedes)
                return parentIDs.isEmpty ? nil : parentIDs.joined(separator: "\u{001f}")
            })
            guard !Task.isCancelled else { return [] }
            blocks.append(RowBlock(
                members: members,
                familyKeys: familyKeys,
                parentX: parentPositions.isEmpty
                    ? .infinity
                    : parentPositions.reduce(0, +) / CGFloat(parentPositions.count),
                key: members.map(\.id).joined(separator: "\u{001f}")
            ))
        }

        guard !Task.isCancelled else { return [] }
        blocks.sort { left, right in
            if left.parentX != right.parentX { return left.parentX < right.parentX }
            for index in 0..<min(left.members.count, right.members.count) {
                let comparison = comparePeople(left.members[index], right.members[index])
                if comparison != .orderedSame { return comparison == .orderedAscending }
            }
            if left.members.count != right.members.count {
                return left.members.count < right.members.count
            }
            return textPrecedes(left.key, right.key)
        }
        return blocks
    }

    private static func needsFamilyGap(_ left: RowBlock, _ right: RowBlock) -> Bool {
        if left.members.count > 1 || right.members.count > 1 { return true }
        if left.familyKeys.isEmpty || right.familyKeys.isEmpty { return true }
        return left.familyKeys.isDisjoint(with: right.familyKeys)
    }

    nonisolated private static func comparePeople(
        _ left: PersonSnapshot,
        _ right: PersonSnapshot
    ) -> ComparisonResult {
        switch (left.birthDate, right.birthDate) {
        case let (leftDate?, rightDate?) where leftDate != rightDate:
            return leftDate < rightDate ? .orderedAscending : .orderedDescending
        case (_?, nil):
            return .orderedAscending
        case (nil, _?):
            return .orderedDescending
        default:
            break
        }
        let genderOrder: [PersonGender: Int] = [.male: 0, .female: 1, .unspecified: 2]
        let leftGender = genderOrder[left.gender, default: 2]
        let rightGender = genderOrder[right.gender, default: 2]
        if leftGender != rightGender {
            return leftGender < rightGender ? .orderedAscending : .orderedDescending
        }
        for (leftText, rightText) in [
            (left.name.lowercased(), right.name.lowercased()),
            (left.name, right.name),
            (left.id, right.id),
        ] {
            let comparison = TreeRoutingGeometry.compareText(leftText, rightText)
            if comparison != .orderedSame { return comparison }
        }
        return .orderedSame
    }

    private static func deriveBirthOrders(
        people: [PersonSnapshot],
        relationships: [RelationshipSnapshot]
    ) -> [String: Int] {
        let peopleByID = Dictionary(uniqueKeysWithValues: people.map { ($0.id, $0) })
        let parentsByChild = Dictionary(
            grouping: relationships.filter {
                $0.kind == .parent && $0.subtype == .biologicalParent
            },
            by: \.toPersonID
        )
        var childrenByFamily = [String: [String]]()
        for (childID, parentRelationships) in parentsByChild {
            let familyID = Set(parentRelationships.map(\.fromPersonID))
                .sorted(by: textPrecedes)
                .joined(separator: "\u{001f}")
            guard !familyID.isEmpty else { continue }
            childrenByFamily[familyID, default: []].append(childID)
        }

        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .gmt
        func birthRange(for person: PersonSnapshot) -> ClosedRange<Date>? {
            guard let birthDate = person.birthDate else { return nil }
            let start = calendar.startOfDay(for: birthDate)
            let end: Date
            switch person.birthDatePrecision {
            case .exact:
                end = start
            case .month:
                var components = calendar.dateComponents([.year, .month], from: start)
                components.day = 1
                guard let firstDay = calendar.date(from: components),
                      let lastDay = calendar.date(
                          byAdding: DateComponents(month: 1, day: -1),
                          to: firstDay
                      ) else {
                    return nil
                }
                end = lastDay
            case .year:
                var components = calendar.dateComponents([.year], from: start)
                components.month = 12
                components.day = 31
                guard let lastDay = calendar.date(from: components) else { return nil }
                end = lastDay
            }
            return start...end
        }

        var result = [String: Int]()
        for childIDs in childrenByFamily.values where childIDs.count > 1 {
            var dated = [(id: String, range: ClosedRange<Date>)]()
            for childID in childIDs {
                guard let person = peopleByID[childID], let range = birthRange(for: person) else {
                    dated.removeAll()
                    break
                }
                dated.append((childID, range))
            }
            guard dated.count == childIDs.count else { continue }
            dated.sort {
                if $0.range.lowerBound != $1.range.lowerBound {
                    return $0.range.lowerBound < $1.range.lowerBound
                }
                return textPrecedes($0.id, $1.id)
            }
            guard !dated.indices.dropFirst().contains(where: {
                dated[$0 - 1].range.upperBound >= dated[$0].range.lowerBound
            }) else {
                continue
            }
            for (index, value) in dated.enumerated() {
                result[value.id] = index + 1
            }
        }
        return result
    }

    nonisolated private static func textPrecedes(_ left: String, _ right: String) -> Bool {
        TreeRoutingGeometry.textPrecedes(left, right)
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
        people: [PersonSnapshot],
        peopleByID: [String: PersonSnapshot],
        relationships: [RelationshipSnapshot]
    ) -> String {
        guard let selectedPersonID else {
            return ""
        }
        if let label = KinshipResolver.label(
            for: personID,
            relativeTo: selectedPersonID,
            people: people,
            relationships: relationships
        ) {
            return label
        }
        guard !Task.isCancelled else { return "" }
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
            guard !Task.isCancelled else { return "" }
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
            guard !Task.isCancelled else { return "" }
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
        let orderedRelationships = relationships.sorted(by: relationshipOrder)

        while index < queue.count {
            guard !Task.isCancelled else { return result }
            let (currentID, distance) = queue[index]
            index += 1
            for relationship in orderedRelationships where relationship.kind == .parent {
                guard !Task.isCancelled else { return result }
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
        comparePeople(lhs, rhs) == .orderedAscending
    }

    nonisolated private static func relationshipOrder(
        _ lhs: RelationshipSnapshot,
        _ rhs: RelationshipSnapshot
    ) -> Bool {
        let kindOrder: [RelationshipKind: Int] = [.parent: 0, .partner: 1, .sibling: 2]
        let lhsKind = kindOrder[lhs.kind, default: 3]
        let rhsKind = kindOrder[rhs.kind, default: 3]
        if lhsKind != rhsKind { return lhsKind < rhsKind }
        for (leftText, rightText) in [
            (lhs.fromPersonID, rhs.fromPersonID),
            (lhs.toPersonID, rhs.toPersonID),
            (lhs.subtype.rawValue, rhs.subtype.rawValue),
            (lhs.id, rhs.id),
        ] {
            let comparison = TreeRoutingGeometry.compareText(leftText, rightText)
            if comparison != .orderedSame { return comparison == .orderedAscending }
        }
        return false
    }

    nonisolated private static func distanceThenID(
        _ lhs: Dictionary<String, Int>.Element,
        _ rhs: Dictionary<String, Int>.Element
    ) -> Bool {
        if lhs.value != rhs.value { return lhs.value < rhs.value }
        return lhs.key < rhs.key
    }
}
