import Foundation

nonisolated struct TreeGenerationLimits: Equatable, Hashable, Sendable {
    var ancestorLevels: Int?
    var descendantLevels: Int?

    static let unlimited = TreeGenerationLimits(
        ancestorLevels: nil,
        descendantLevels: nil
    )

    var isUnlimited: Bool {
        ancestorLevels == nil && descendantLevels == nil
    }

    func clamped(to availableLevels: TreeAvailableGenerationLevels) -> TreeGenerationLimits {
        TreeGenerationLimits(
            ancestorLevels: clamped(ancestorLevels, maximum: availableLevels.ancestorLevels),
            descendantLevels: clamped(descendantLevels, maximum: availableLevels.descendantLevels)
        )
    }

    private func clamped(_ limit: Int?, maximum: Int) -> Int? {
        guard maximum > 0 else { return nil }
        return limit.map { min(max($0, 0), maximum) }
    }
}

nonisolated struct TreeAvailableGenerationLevels: Equatable, Sendable {
    let ancestorLevels: Int
    let descendantLevels: Int

    static let none = TreeAvailableGenerationLevels(
        ancestorLevels: 0,
        descendantLevels: 0
    )

    var hasAny: Bool {
        ancestorLevels > 0 || descendantLevels > 0
    }
}

nonisolated enum TreeGenerationFilter {
    static func availableLevels(
        selectedPersonID: String?,
        validPersonIDs: Set<String>,
        relationships: [RelationshipSnapshot],
        depths: [String: Int]
    ) -> TreeAvailableGenerationLevels {
        guard let relativeLevels = relativeLevels(
            selectedPersonID: selectedPersonID,
            validPersonIDs: validPersonIDs,
            relationships: relationships,
            depths: depths
        ) else {
            return .none
        }

        return TreeAvailableGenerationLevels(
            ancestorLevels: max(0, -(relativeLevels.values.min() ?? 0)),
            descendantLevels: max(0, relativeLevels.values.max() ?? 0)
        )
    }

    static func visiblePersonIDs(
        selectedPersonID: String?,
        validPersonIDs: Set<String>,
        relationships: [RelationshipSnapshot],
        depths: [String: Int],
        limits: TreeGenerationLimits
    ) -> Set<String> {
        guard !limits.isUnlimited else {
            return validPersonIDs
        }
        guard let relativeLevels = relativeLevels(
            selectedPersonID: selectedPersonID,
            validPersonIDs: validPersonIDs,
            relationships: relationships,
            depths: depths
        ) else {
            return validPersonIDs
        }

        return Set(relativeLevels.compactMap { personID, relativeLevel in
            if relativeLevel < 0, let limit = limits.ancestorLevels {
                return -relativeLevel <= max(limit, 0) ? personID : nil
            }
            if relativeLevel > 0, let limit = limits.descendantLevels {
                return relativeLevel <= max(limit, 0) ? personID : nil
            }
            return personID
        })
    }

    private static func relativeLevels(
        selectedPersonID: String?,
        validPersonIDs: Set<String>,
        relationships: [RelationshipSnapshot],
        depths: [String: Int]
    ) -> [String: Int]? {
        guard let selectedPersonID,
              validPersonIDs.contains(selectedPersonID),
              let selectedDepth = depths[selectedPersonID] else {
            return nil
        }

        let connectedIDs = connectedPersonIDs(
            from: selectedPersonID,
            validPersonIDs: validPersonIDs,
            relationships: relationships
        )
        guard !Task.isCancelled else { return nil }
        let ancestorDistances = parentDistances(
            from: selectedPersonID,
            validPersonIDs: validPersonIDs,
            relationships: relationships,
            followsParents: true
        )
        guard !Task.isCancelled else { return nil }
        let descendantDistances = parentDistances(
            from: selectedPersonID,
            validPersonIDs: validPersonIDs,
            relationships: relationships,
            followsParents: false
        )
        guard !Task.isCancelled else { return nil }

        var result = [String: Int]()
        for personID in connectedIDs {
            guard !Task.isCancelled else { return nil }
            let fallbackLevel = (depths[personID] ?? selectedDepth) - selectedDepth
            switch (ancestorDistances[personID], descendantDistances[personID]) {
            case let (ancestorDistance?, descendantDistance?) where ancestorDistance < descendantDistance:
                result[personID] = -ancestorDistance
            case let (ancestorDistance?, descendantDistance?) where descendantDistance < ancestorDistance:
                result[personID] = descendantDistance
            case let (ancestorDistance?, descendantDistance?):
                result[personID] = fallbackLevel < 0 ? -ancestorDistance : descendantDistance
            case let (ancestorDistance?, nil):
                result[personID] = -ancestorDistance
            case let (nil, descendantDistance?):
                result[personID] = descendantDistance
            case (nil, nil):
                result[personID] = fallbackLevel
            }
        }
        return result
    }

    private static func parentDistances(
        from selectedPersonID: String,
        validPersonIDs: Set<String>,
        relationships: [RelationshipSnapshot],
        followsParents: Bool
    ) -> [String: Int] {
        var result = [String: Int]()
        var queue = [(selectedPersonID, 0)]
        var index = 0
        while index < queue.count {
            guard !Task.isCancelled else { return result }
            let (personID, distance) = queue[index]
            index += 1
            for relationship in relationships where relationship.kind == .parent {
                guard !Task.isCancelled else { return result }
                let nextPersonID: String?
                if followsParents, relationship.toPersonID == personID {
                    nextPersonID = relationship.fromPersonID
                } else if !followsParents, relationship.fromPersonID == personID {
                    nextPersonID = relationship.toPersonID
                } else {
                    nextPersonID = nil
                }
                guard let nextPersonID,
                      validPersonIDs.contains(nextPersonID),
                      nextPersonID != selectedPersonID,
                      result[nextPersonID] == nil else {
                    continue
                }
                result[nextPersonID] = distance + 1
                queue.append((nextPersonID, distance + 1))
            }
        }
        return result
    }

    private static func connectedPersonIDs(
        from selectedPersonID: String,
        validPersonIDs: Set<String>,
        relationships: [RelationshipSnapshot]
    ) -> Set<String> {
        var adjacentIDs = [String: Set<String>]()
        for relationship in relationships {
            guard !Task.isCancelled else { return [] }
            guard validPersonIDs.contains(relationship.fromPersonID),
                  validPersonIDs.contains(relationship.toPersonID),
                  relationship.fromPersonID != relationship.toPersonID else {
                continue
            }
            adjacentIDs[relationship.fromPersonID, default: []].insert(relationship.toPersonID)
            adjacentIDs[relationship.toPersonID, default: []].insert(relationship.fromPersonID)
        }

        var result: Set<String> = [selectedPersonID]
        var queue = [selectedPersonID]
        var index = 0
        while index < queue.count {
            guard !Task.isCancelled else { return result }
            let personID = queue[index]
            index += 1
            for adjacentID in adjacentIDs[personID, default: []] where result.insert(adjacentID).inserted {
                queue.append(adjacentID)
            }
        }
        return result
    }
}

extension Person {
    var treeSnapshot: PersonSnapshot {
        PersonSnapshot(
            id: id,
            name: displayName,
            gender: gender,
            profilePhotoData: profilePhotoData,
            lifeSummary: lifeSummary,
            city: city,
            birthDate: birthDate,
            birthDatePrecision: birthDatePrecision
        )
    }
}

extension FamilyRelationship {
    var treeSnapshot: RelationshipSnapshot {
        RelationshipSnapshot(
            id: id,
            fromPersonID: fromPersonID,
            toPersonID: toPersonID,
            kind: kind,
            subtype: subtype,
            marriageDate: marriageDate,
            marriageYear: marriageYear
        )
    }
}
