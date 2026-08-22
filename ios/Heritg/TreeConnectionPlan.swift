import CoreGraphics
import Foundation

nonisolated struct TreeConnectionPlanFingerprint: Equatable, Sendable {
    private struct Node: Equatable, Sendable {
        let id: String
        let position: CGPoint
        let hasLifeSummary: Bool
        let hasCity: Bool
    }

    private let nodes: [Node]
    private let edges: [TreeEdgeLayout]
    private let controlsVisible: Bool
    private let sourcePersonCount: Int
    private let localeIdentifier: String

    init(
        layout: TreeLayoutResult,
        controlsVisible: Bool,
        sourcePersonCount: Int,
        localeIdentifier: String
    ) {
        nodes = layout.nodes.map {
            Node(
                id: $0.id,
                position: $0.position,
                hasLifeSummary: $0.person.lifeSummary != nil,
                hasCity: TreeVisualMetrics.formattedCity($0.person.city) != nil
            )
        }
        edges = layout.edges
        self.controlsVisible = controlsVisible
        self.sourcePersonCount = sourcePersonCount
        self.localeIdentifier = localeIdentifier
    }
}

nonisolated struct TreeConnectionPlan: Equatable, Sendable {
    static let familyRailSpacing: CGFloat = 32
    static let empty = TreeConnectionPlan(
        families: [],
        nonParentRoutes: [],
        obstacles: [],
        controls: [],
        plannedCrossings: [],
        rawBounds: .zero,
        failures: [],
        isValid: true,
        nonParentEdges: [],
        crossings: [],
        showsRelationshipLabels: true
    )

    struct Family: Identifiable, Equatable, Sendable {
        let id: String
        let parentIDs: [String]
        let childIDs: [String]
        let relationshipIDs: [String]
        let parentCenters: [CGPoint]
        var parentPorts: [CGPoint]
        let parentLabelBottoms: [CGFloat]
        let children: [CGPoint]
        let interval: ClosedRange<CGFloat>
        let band: Band
        var branchOffset: CGFloat = 0
        var laneIndex = 0
        var laneCount = 1
        var segments = [TreeConnector.Segment]()
        var junctions = [CGPoint]()
        fileprivate var baseSegments = [TreeConnector.Segment]()
    }

    struct NonParentRoute: Identifiable, Equatable, Sendable {
        let id: String
        let relationship: TreeEdgeLayout
        let segments: [TreeConnector.Segment]
        let label: TreeRoutingGeometry.RelationshipLabel?
    }

    struct Crossing: Equatable, Sendable {
        let point: CGPoint
        let kind: RelationshipKind

        var x: CGFloat { point.x }
        var y: CGFloat { point.y }
    }

    struct Band: Hashable, Comparable, Sendable {
        let parentY: Int
        let childY: Int

        static func < (lhs: Band, rhs: Band) -> Bool {
            (lhs.parentY, lhs.childY) < (rhs.parentY, rhs.childY)
        }
    }

    private struct ParentSet: Hashable {
        let ids: [String]
    }

    private struct ConnectorNetwork {
        let segments: [TreeConnector.Segment]
        let endpointIDs: [String]
        let kind: RelationshipKind
    }

    let families: [Family]
    let nonParentRoutes: [NonParentRoute]
    let obstacles: [TreeRoutingGeometry.Obstacle]
    let controls: [TreeRoutingGeometry.ControlPlacement]
    let plannedCrossings: [Crossing]
    let rawBounds: CGRect
    let failures: [String]
    let isValid: Bool

    // Compatibility surfaces for renderers that have not moved to planned routes yet.
    let nonParentEdges: [TreeEdgeLayout]
    let crossings: [CGPoint]
    let showsRelationshipLabels: Bool

    var crossingsWithRelationshipKind: [Crossing] { plannedCrossings }
    var labels: [TreeRoutingGeometry.RelationshipLabel] {
        nonParentRoutes.compactMap(\.label)
    }
    var bounds: CGRect { rawBounds }

    static func make(from layout: TreeLayoutResult) -> TreeConnectionPlan {
        make(from: layout, showsRelationshipLabels: true)
    }

    static func make(
        from layout: TreeLayoutResult,
        showsRelationshipLabels: Bool
    ) -> TreeConnectionPlan {
        make(
            from: layout,
            showsRelationshipLabels: showsRelationshipLabels,
            controlsVisible: true,
            sourcePersonCount: layout.nodes.count
        )
    }

    static func make(
        from layout: TreeLayoutResult,
        showsRelationshipLabels: Bool,
        controlsVisible: Bool,
        sourcePersonCount: Int
    ) -> TreeConnectionPlan {
        let nodesByID = Dictionary(uniqueKeysWithValues: layout.nodes.map { ($0.id, $0) })
        let controls = makeControls(layout: layout, nodesByID: nodesByID)
        var obstacles = makeNodeObstacles(
            layout: layout,
            controls: controls,
            controlsVisible: controlsVisible,
            sourcePersonCount: sourcePersonCount
        )
        var failures = [String]()
        var families = buildFamilies(
            layout: layout,
            nodesByID: nodesByID,
            nodeObstacles: obstacles
        )
        var occupied = routeFamilies(&families, obstacles: obstacles, failures: &failures)
        var nonParentRoutes = [NonParentRoute]()
        let nonParentEdges = layout.edges.filter { $0.kind != .parent }.sorted {
            TreeRoutingGeometry.textPrecedes($0.id, $1.id)
        }
        let familyChildSets = families.map { Set($0.childIDs) }

        for relationship in nonParentEdges {
            if relationship.kind == .sibling,
               familyChildSets.contains(where: {
                   $0.contains(relationship.fromPersonID) && $0.contains(relationship.toPersonID)
               }) {
                continue
            }
            guard let from = nodesByID[relationship.fromPersonID],
                  let to = nodesByID[relationship.toPersonID] else { continue }
            let ordered: (TreeNodeLayout, TreeNodeLayout)
            if from.position.x < to.position.x ||
                from.position.x == to.position.x &&
                TreeRoutingGeometry.compareText(from.id, to.id) != .orderedDescending {
                ordered = (from, to)
            } else {
                ordered = (to, from)
            }
            let endpointIDs: Set<String> = [from.id, to.id]
            var segments = TreeObstacleRouter.routeBetweenPeople(
                left: ordered.0.position,
                right: ordered.1.position,
                endpointIDs: endpointIDs,
                obstacles: obstacles,
                occupied: occupied,
                radius: TreeVisualMetrics.avatarRadius
            )
            if segments == nil {
                segments = TreeObstacleRouter.routeBetweenPeople(
                    left: ordered.0.position,
                    right: ordered.1.position,
                    endpointIDs: endpointIDs,
                    obstacles: obstacles,
                    occupied: [],
                    radius: TreeVisualMetrics.avatarRadius
                ) ?? TreeRoutingGeometry.segments(for: [
                    CGPoint(
                        x: ordered.0.position.x + TreeVisualMetrics.avatarRadius,
                        y: ordered.0.position.y
                    ),
                    CGPoint(
                        x: ordered.1.position.x - TreeVisualMetrics.avatarRadius,
                        y: ordered.1.position.y
                    ),
                ])
                failures.append("relationship:\(relationship.id)")
            }

            let compatibilityLabelText = showsRelationshipLabels && relationship.kind == .partner &&
                (relationship.marriageDate != nil || relationship.marriageYear != nil)
                ? relationship.marriageLabel
                : nil
            let placement = compatibilityLabelText.flatMap { text in
                TreeObstacleRouter.placeRelationshipLabel(
                    relationshipID: relationship.id,
                    text: text,
                    segments: segments ?? [],
                    obstacles: obstacles,
                    occupied: occupied + (segments ?? [])
                )
            }
            nonParentRoutes.append(NonParentRoute(
                id: relationship.id,
                relationship: relationship,
                segments: segments ?? [],
                label: placement?.label
            ))
            occupied += segments ?? []
            if let placement { obstacles.append(placement.obstacle) }
        }

        let connectors = families.map {
            ConnectorNetwork(
                segments: $0.segments,
                endpointIDs: $0.parentIDs + $0.childIDs,
                kind: .parent
            )
        } + nonParentRoutes.map {
            ConnectorNetwork(
                segments: $0.segments,
                endpointIDs: [
                    $0.relationship.fromPersonID,
                    $0.relationship.toPersonID,
                ],
                kind: $0.relationship.kind
            )
        }
        let plannedCrossings = crossingPoints(in: connectors)
        let allSegments = connectors.flatMap(\.segments)
        let selfOverlap = connectors.contains { connector in
            connector.segments.indices.contains { index in
                connector.segments.dropFirst(index + 1).contains {
                    TreeRoutingGeometry.collinearlyOverlaps(connector.segments[index], $0)
                }
            }
        }
        let rawBounds = planBounds(obstacles: obstacles, segments: allSegments)

        return TreeConnectionPlan(
            families: families,
            nonParentRoutes: nonParentRoutes,
            obstacles: obstacles,
            controls: controls,
            plannedCrossings: plannedCrossings,
            rawBounds: rawBounds,
            failures: failures,
            isValid: failures.isEmpty && !selfOverlap,
            nonParentEdges: nonParentEdges,
            crossings: plannedCrossings.map(\.point),
            showsRelationshipLabels: showsRelationshipLabels
        )
    }

    var connectorBounds: CGRect {
        let segments = families.flatMap(\.segments) + nonParentRoutes.flatMap(\.segments)
        guard !segments.isEmpty else { return .null }
        return segments.reduce(into: CGRect.null) { bounds, segment in
            bounds = bounds.union(CGRect(
                x: min(segment.start.x, segment.end.x),
                y: min(segment.start.y, segment.end.y),
                width: abs(segment.end.x - segment.start.x),
                height: abs(segment.end.y - segment.start.y)
            ))
        }
    }

    func drawingBounds(including nodes: [TreeNodeLayout]) -> CGRect {
        rawBounds.insetBy(dx: -100, dy: -100)
    }

    static func segmentsFormConnectedNetwork(_ segments: [TreeConnector.Segment]) -> Bool {
        guard !segments.isEmpty else { return false }
        var visited: Set<Int> = [0]
        var pending = [0]
        while let index = pending.popLast() {
            for candidateIndex in segments.indices
                where !visited.contains(candidateIndex) &&
                segmentsTouch(segments[index], segments[candidateIndex]) {
                visited.insert(candidateIndex)
                pending.append(candidateIndex)
            }
        }
        return visited.count == segments.count
    }

    private static func makeControls(
        layout: TreeLayoutResult,
        nodesByID: [String: TreeNodeLayout]
    ) -> [TreeRoutingGeometry.ControlPlacement] {
        var occupiedByNodeID = [String: Set<TreeRoutingGeometry.ControlPlacement.Side>]()
        for relationship in layout.edges where relationship.kind != .parent {
            guard let from = nodesByID[relationship.fromPersonID],
                  let to = nodesByID[relationship.toPersonID] else { continue }
            occupiedByNodeID[from.id, default: []].insert(
                to.position.x < from.position.x ? .left : .right
            )
            occupiedByNodeID[to.id, default: []].insert(
                from.position.x < to.position.x ? .left : .right
            )
        }

        return layout.nodes.sorted {
            TreeRoutingGeometry.textPrecedes($0.id, $1.id)
        }.map { node in
            let occupied = occupiedByNodeID[node.id, default: []]
            let preferred: TreeRoutingGeometry.ControlPlacement.Side =
                node.position.x <= 0 ? .left : .right
            let opposite: TreeRoutingGeometry.ControlPlacement.Side =
                preferred == .left ? .right : .left
            let side = occupied.contains(preferred) && !occupied.contains(opposite)
                ? opposite : preferred
            let direction: CGFloat = side == .left ? -1 : 1
            return TreeRoutingGeometry.ControlPlacement(
                personID: node.id,
                side: side,
                addCenter: CGPoint(
                    x: node.position.x + direction * 66,
                    y: node.position.y
                ),
                editCenter: CGPoint(
                    x: node.position.x + direction * 110,
                    y: node.position.y
                )
            )
        }
    }

    private static func makeNodeObstacles(
        layout: TreeLayoutResult,
        controls: [TreeRoutingGeometry.ControlPlacement],
        controlsVisible: Bool,
        sourcePersonCount: Int
    ) -> [TreeRoutingGeometry.Obstacle] {
        let controlsByID = Dictionary(uniqueKeysWithValues: controls.map { ($0.personID, $0) })
        return layout.nodes.sorted {
            TreeRoutingGeometry.textPrecedes($0.id, $1.id)
        }.flatMap { node -> [TreeRoutingGeometry.Obstacle] in
            var result = [
                TreeRoutingGeometry.Obstacle(
                    kind: .avatar,
                    ownerID: node.id,
                    rect: TreeRoutingGeometry.avatarRect(center: node.position)
                ),
                TreeRoutingGeometry.Obstacle(
                    kind: .nodeLabel,
                    ownerID: node.id,
                    rect: TreeRoutingGeometry.nodeLabelRect(for: node)
                ),
            ]
            if controlsVisible, sourcePersonCount <= 24, let control = controlsByID[node.id] {
                result += [
                    TreeRoutingGeometry.Obstacle(
                        kind: .addControl,
                        ownerID: node.id,
                        rect: TreeRoutingGeometry.controlRect(center: control.addCenter)
                    ),
                    TreeRoutingGeometry.Obstacle(
                        kind: .editControl,
                        ownerID: node.id,
                        rect: TreeRoutingGeometry.controlRect(center: control.editCenter)
                    ),
                ]
            }
            return result
        }
    }

    private static func buildFamilies(
        layout: TreeLayoutResult,
        nodesByID: [String: TreeNodeLayout],
        nodeObstacles: [TreeRoutingGeometry.Obstacle]
    ) -> [Family] {
        let edgesByChild = Dictionary(
            grouping: layout.edges.filter { $0.kind == .parent },
            by: \.toPersonID
        )
        var groups = [ParentSet: (children: Set<String>, relationships: Set<String>)]()
        for childID in edgesByChild.keys.sorted(by: {
            TreeRoutingGeometry.textPrecedes($0, $1)
        }) {
            let edges = edgesByChild[childID] ?? []
            let parentIDs = Array(Set(edges.map(\.fromPersonID))).sorted {
                TreeRoutingGeometry.textPrecedes($0, $1)
            }
            guard !parentIDs.isEmpty, nodesByID[childID] != nil,
                  parentIDs.allSatisfy({ nodesByID[$0] != nil }) else { continue }
            let key = ParentSet(ids: parentIDs)
            groups[key, default: ([], [])].children.insert(childID)
            groups[key, default: ([], [])].relationships.formUnion(edges.map(\.id))
        }

        var families = groups.map { parentSet, group -> Family in
            let parents = parentSet.ids.compactMap { nodesByID[$0] }.sorted {
                nodePositionOrder($0, $1)
            }
            let children = group.children.compactMap { nodesByID[$0] }.sorted {
                nodePositionOrder($0, $1)
            }
            let coordinates = (parents + children).map(\.position.x)
            let parentMeanY = average(parents.map(\.position.y))
            let childMeanY = average(children.map(\.position.y))
            let parentPorts = parents.map {
                CGPoint(x: $0.position.x, y: TreeRoutingGeometry.parentPortY(for: $0))
            }
            return Family(
                id: stableID(for: parentSet.ids),
                parentIDs: parents.map(\.id),
                childIDs: children.map(\.id),
                relationshipIDs: group.relationships.sorted {
                    TreeRoutingGeometry.textPrecedes($0, $1)
                },
                parentCenters: parents.map(\.position),
                parentPorts: parentPorts,
                parentLabelBottoms: zip(parents, parentPorts).map {
                    $1.y - $0.position.y
                },
                children: children.map(\.position),
                interval: (coordinates.min() ?? 0)...(coordinates.max() ?? 0),
                band: Band(
                    parentY: Int(floor(parentMeanY + 0.5)),
                    childY: Int(floor(childMeanY + 0.5))
                )
            )
        }

        for parentY in Set(families.map(\.band.parentY)).sorted() {
            let indices = families.indices.filter {
                families[$0].band.parentY == parentY
            }.sorted {
                familyIntervalOrder(families[$0], families[$1])
            }
            let lanes = laneIndices(for: indices.map { families[$0].interval })
            let laneCount = (lanes.max() ?? 0) + 1
            for (index, lane) in zip(indices, lanes) {
                families[index].laneIndex = lane
                families[index].laneCount = laneCount
            }
        }

        let familyIndicesByParent = families.indices.reduce(into: [String: [Int]]()) {
            result, familyIndex in
            for parentID in families[familyIndex].parentIDs {
                result[parentID, default: []].append(familyIndex)
            }
        }
        for parentID in familyIndicesByParent.keys.sorted(by: {
            TreeRoutingGeometry.textPrecedes($0, $1)
        }) {
            let ordered = familyIndicesByParent[parentID, default: []].sorted {
                TreeRoutingGeometry.textPrecedes(families[$0].id, families[$1].id)
            }
            for (index, familyIndex) in ordered.enumerated() {
                guard let parentIndex = families[familyIndex].parentIDs.firstIndex(of: parentID) else {
                    continue
                }
                let desiredX = families[familyIndex].parentCenters[parentIndex].x +
                    (CGFloat(index) - CGFloat(ordered.count - 1) / 2) * familyRailSpacing
                families[familyIndex].parentPorts[parentIndex].x = desiredX
            }
        }

        for familyIndex in families.indices {
            var parentStartY = families[familyIndex].parentPorts.map(\.y).max() ?? 0
            let parentRowY = average(families[familyIndex].parentCenters.map(\.y))
            for obstacle in nodeObstacles where obstacle.kind == .nodeLabel &&
                !families[familyIndex].parentIDs.contains(obstacle.ownerID) {
                guard let person = nodesByID[obstacle.ownerID],
                      abs(person.position.y - parentRowY) < 0.5,
                      obstacle.rect.maxX >= families[familyIndex].interval.lowerBound,
                      obstacle.rect.minX <= families[familyIndex].interval.upperBound else {
                    continue
                }
                parentStartY = max(
                    parentStartY,
                    obstacle.rect.maxY + TreeRoutingGeometry.clearance
                )
            }
            let childTopY = families[familyIndex].children.map {
                $0.y - TreeVisualMetrics.avatarRadius
            }.min() ?? 0
            let availableHeight = max(childTopY - parentStartY - 32, 0)
            let laneCount = families[familyIndex].laneCount
            let laneIndex = families[familyIndex].laneIndex
            let spacing = laneCount > 1
                ? max(2, min(
                    familyRailSpacing,
                    availableHeight / CGFloat((laneCount - 1) * 2)
                ))
                : 0
            let parentJoinY = parentStartY + 8 + CGFloat(laneIndex) * spacing
            let childRailOffset = TreeRoutingGeometry.childRailClearance
            let baseTrunkX = average(families[familyIndex].parentPorts.map(\.x))
            let nearestChildX = families[familyIndex].children.sorted {
                let leftDistance = abs($0.x - baseTrunkX)
                let rightDistance = abs($1.x - baseTrunkX)
                return leftDistance == rightDistance ? $0.x < $1.x : leftDistance < rightDistance
            }.first?.x ?? baseTrunkX
            let overlapsEndpoint = families.contains { other in
                other.id != families[familyIndex].id &&
                    other.band.parentY == families[familyIndex].band.parentY &&
                    (other.parentPorts + other.children).contains { $0.x == nearestChildX }
            }
            let aligns = !overlapsEndpoint &&
                (families[familyIndex].children.count == 1 ||
                 abs(nearestChildX - baseTrunkX) <= TreeRoutingGeometry.clearance + 4)
            let trunkX = aligns ? nearestChildX : baseTrunkX +
                (CGFloat(laneIndex) - CGFloat(laneCount - 1) / 2) * 8
            var continuationTrunkX = trunkX
            if Set(families[familyIndex].children.map(\.y)).count > 1 {
                let childXs = Array(Set(families[familyIndex].children.map(\.x))).sorted()
                var internalChannels = [CGFloat]()
                if childXs.count > 1 {
                    for index in 0..<(childXs.count - 1) {
                        let left = childXs[index]
                        let right = childXs[index + 1]
                        let requiredWidth = TreeVisualMetrics.nodeLabelWidth +
                            TreeRoutingGeometry.clearance * 2
                        if right - left > requiredWidth {
                            internalChannels.append((left + right) / 2)
                        }
                    }
                }
                let outerClearance = TreeVisualMetrics.nodeLabelWidth / 2 +
                    TreeRoutingGeometry.clearance * 2
                let clearChannels = internalChannels + [
                    (childXs.first ?? 0) - outerClearance,
                    (childXs.last ?? 0) + outerClearance,
                ]
                let deepestRailY = families[familyIndex].children.map {
                    $0.y - TreeVisualMetrics.avatarRadius - childRailOffset
                }.max() ?? parentJoinY
                let safeChannels = clearChannels.filter { x in
                    nodeObstacles.allSatisfy {
                        !TreeRoutingGeometry.segmentIntersectsRect(
                            TreeConnector.Segment(
                                start: CGPoint(x: x, y: parentJoinY),
                                end: CGPoint(x: x, y: deepestRailY)
                            ),
                            $0.rect
                        )
                    }
                }
                continuationTrunkX = (safeChannels.isEmpty ? clearChannels : safeChannels)
                    .sorted {
                        let leftDistance = abs($0 - baseTrunkX)
                        let rightDistance = abs($1 - baseTrunkX)
                        return leftDistance == rightDistance ? $0 < $1 : leftDistance < rightDistance
                    }.first ?? trunkX
            }
            let baseSegments = familySegments(
                parentPorts: families[familyIndex].parentPorts,
                children: families[familyIndex].children,
                parentJoinY: parentJoinY,
                childRailOffset: childRailOffset,
                parentTrunkX: trunkX,
                continuationTrunkX: continuationTrunkX
            )
            families[familyIndex].baseSegments = baseSegments
            families[familyIndex].segments = baseSegments
            let firstRailY = families[familyIndex].children.map(\.y).min().map {
                $0 - TreeVisualMetrics.avatarRadius - childRailOffset
            } ?? parentJoinY
            families[familyIndex].branchOffset = firstRailY - (parentStartY + childTopY) / 2
            let childRailYs = Array(Set(families[familyIndex].children.map {
                $0.y - TreeVisualMetrics.avatarRadius - childRailOffset
            })).sorted()
            families[familyIndex].junctions = [CGPoint(x: trunkX, y: parentJoinY)] +
                childRailYs.enumerated().flatMap { index, y in
                    if index == 0 {
                        return [CGPoint(x: trunkX, y: y)] +
                            (continuationTrunkX == trunkX
                                ? []
                                : [CGPoint(x: continuationTrunkX, y: y)])
                    }
                    return [CGPoint(x: continuationTrunkX, y: y)]
                }
        }

        return families.sorted { familyRoutingOrder($0, $1) }
    }

    private static func routeFamilies(
        _ families: inout [Family],
        obstacles: [TreeRoutingGeometry.Obstacle],
        failures: inout [String]
    ) -> [TreeConnector.Segment] {
        var occupied = [TreeConnector.Segment]()
        for familyIndex in families.indices {
            let endpointIDs = Set(families[familyIndex].parentIDs + families[familyIndex].childIDs)
            var routed = [TreeConnector.Segment]()
            var didFail = false
            for segment in TreeObstacleRouter.splitAtAttachmentPoints(
                families[familyIndex].baseSegments
            ) {
                guard let route = TreeObstacleRouter.preferredRoute(
                    start: segment.start,
                    end: segment.end,
                    obstacles: obstacles,
                    endpointIDs: endpointIDs,
                    occupied: occupied + routed
                ) else {
                    didFail = true
                    break
                }
                routed += route
            }
            if !didFail,
               TreeRoutingGeometry.routeIsClear(
                routed,
                obstacles: obstacles,
                endpointIDs: endpointIDs
               ),
               segmentsFormConnectedNetwork(routed) {
                families[familyIndex].segments = routed
            } else {
                var relaxed = [TreeConnector.Segment]()
                for segment in TreeObstacleRouter.splitAtAttachmentPoints(
                    families[familyIndex].baseSegments
                ) {
                    guard let route = TreeObstacleRouter.preferredRoute(
                        start: segment.start,
                        end: segment.end,
                        obstacles: obstacles,
                        endpointIDs: endpointIDs,
                        occupied: relaxed
                    ) else {
                        relaxed.removeAll()
                        break
                    }
                    relaxed += route
                }
                families[familyIndex].segments = !relaxed.isEmpty &&
                    segmentsFormConnectedNetwork(relaxed) ? relaxed : families[familyIndex].baseSegments
                failures.append("family:\(families[familyIndex].id)")
            }
            occupied += families[familyIndex].segments
        }
        return occupied
    }

    private static func familySegments(
        parentPorts: [CGPoint],
        children: [CGPoint],
        parentJoinY: CGFloat,
        childRailOffset: CGFloat,
        parentTrunkX: CGFloat,
        continuationTrunkX: CGFloat
    ) -> [TreeConnector.Segment] {
        let parentXs = parentPorts.map(\.x) + [parentTrunkX]
        let childYs = Array(Set(children.map(\.y))).sorted()
        let childRows = childYs.map { childY in
            (
                children: children.filter { $0.y == childY },
                railY: childY - TreeVisualMetrics.avatarRadius - childRailOffset
            )
        }
        guard let firstRow = childRows.first else { return [] }
        var segments = parentPorts.map {
            TreeConnector.Segment(
                start: $0,
                end: CGPoint(x: $0.x, y: parentJoinY)
            )
        }
        segments += [
            TreeConnector.Segment(
                start: CGPoint(x: parentXs.min() ?? parentTrunkX, y: parentJoinY),
                end: CGPoint(x: parentXs.max() ?? parentTrunkX, y: parentJoinY)
            ),
            TreeConnector.Segment(
                start: CGPoint(x: parentTrunkX, y: parentJoinY),
                end: CGPoint(x: parentTrunkX, y: firstRow.railY)
            ),
        ]
        if childRows.count > 1, let lastRow = childRows.last {
            segments.append(TreeConnector.Segment(
                start: CGPoint(x: continuationTrunkX, y: firstRow.railY),
                end: CGPoint(x: continuationTrunkX, y: lastRow.railY)
            ))
        }
        for (rowIndex, row) in childRows.enumerated() {
            var childXs = row.children.map(\.x)
            childXs.append(rowIndex == 0 ? parentTrunkX : continuationTrunkX)
            if rowIndex == 0, childRows.count > 1 { childXs.append(continuationTrunkX) }
            segments.append(TreeConnector.Segment(
                start: CGPoint(x: childXs.min() ?? parentTrunkX, y: row.railY),
                end: CGPoint(x: childXs.max() ?? parentTrunkX, y: row.railY)
            ))
            segments += row.children.map {
                TreeConnector.Segment(
                    start: CGPoint(x: $0.x, y: row.railY),
                    end: CGPoint(x: $0.x, y: $0.y - TreeVisualMetrics.avatarRadius)
                )
            }
        }
        return segments.filter { $0.orientation != nil }
    }

    private static func crossingPoints(in connectors: [ConnectorNetwork]) -> [Crossing] {
        var result = [Crossing]()
        for firstIndex in connectors.indices {
            for secondIndex in connectors.indices where secondIndex > firstIndex {
                let first = connectors[firstIndex]
                let second = connectors[secondIndex]
                for left in first.segments {
                    for right in second.segments {
                        guard let point = crossingPoint(left, right),
                              !result.contains(where: {
                                  TreeRoutingGeometry.pointsEqual($0.point, point)
                              }) else { continue }
                        let sharedIDs = Set(first.endpointIDs).intersection(second.endpointIDs)
                        let firstTerminals = [
                            first.segments.first?.start,
                            first.segments.last?.end,
                        ].compactMap { $0 }
                        let secondTerminals = [
                            second.segments.first?.start,
                            second.segments.last?.end,
                        ].compactMap { $0 }
                        let sharedTerminal = !sharedIDs.isEmpty &&
                            firstTerminals.contains(where: {
                                TreeRoutingGeometry.pointsEqual($0, point)
                            }) && secondTerminals.contains(where: {
                                TreeRoutingGeometry.pointsEqual($0, point)
                            })
                        if !sharedTerminal {
                            result.append(Crossing(
                                point: point,
                                kind: left.orientation == .vertical ? first.kind : second.kind
                            ))
                        }
                    }
                }
            }
        }
        return result.sorted {
            $0.y == $1.y ? $0.x < $1.x : $0.y < $1.y
        }
    }

    private static func crossingPoint(
        _ left: TreeConnector.Segment,
        _ right: TreeConnector.Segment
    ) -> CGPoint? {
        let horizontal = left.orientation == .horizontal ? left :
            right.orientation == .horizontal ? right : nil
        let vertical = left.orientation == .vertical ? left :
            right.orientation == .vertical ? right : nil
        guard let horizontal, let vertical,
              vertical.start.x >= min(horizontal.start.x, horizontal.end.x) -
                TreeRoutingGeometry.epsilon,
              vertical.start.x <= max(horizontal.start.x, horizontal.end.x) +
                TreeRoutingGeometry.epsilon,
              horizontal.start.y >= min(vertical.start.y, vertical.end.y) -
                TreeRoutingGeometry.epsilon,
              horizontal.start.y <= max(vertical.start.y, vertical.end.y) +
                TreeRoutingGeometry.epsilon else { return nil }
        return CGPoint(x: vertical.start.x, y: horizontal.start.y)
    }

    private static func segmentsTouch(
        _ left: TreeConnector.Segment,
        _ right: TreeConnector.Segment
    ) -> Bool {
        if left.orientation == right.orientation {
            if left.orientation == .horizontal,
               abs(left.start.y - right.start.y) < TreeRoutingGeometry.epsilon {
                return max(min(left.start.x, left.end.x), min(right.start.x, right.end.x)) <=
                    min(max(left.start.x, left.end.x), max(right.start.x, right.end.x)) +
                    TreeRoutingGeometry.epsilon
            }
            if left.orientation == .vertical,
               abs(left.start.x - right.start.x) < TreeRoutingGeometry.epsilon {
                return max(min(left.start.y, left.end.y), min(right.start.y, right.end.y)) <=
                    min(max(left.start.y, left.end.y), max(right.start.y, right.end.y)) +
                    TreeRoutingGeometry.epsilon
            }
        }
        return crossingPoint(left, right) != nil
    }

    private static func planBounds(
        obstacles: [TreeRoutingGeometry.Obstacle],
        segments: [TreeConnector.Segment]
    ) -> CGRect {
        let visibleObstacles = obstacles.filter {
            $0.kind != .addControl && $0.kind != .editControl
        }
        var minX: CGFloat = 0
        var maxX: CGFloat = 0
        var minY: CGFloat = 0
        var maxY: CGFloat = 0
        for obstacle in visibleObstacles {
            minX = min(minX, obstacle.rect.minX)
            maxX = max(maxX, obstacle.rect.maxX)
            minY = min(minY, obstacle.rect.minY)
            maxY = max(maxY, obstacle.rect.maxY)
        }
        for segment in segments {
            minX = min(minX, segment.start.x, segment.end.x)
            maxX = max(maxX, segment.start.x, segment.end.x)
            minY = min(minY, segment.start.y, segment.end.y)
            maxY = max(maxY, segment.start.y, segment.end.y)
        }
        return CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY)
    }

    private static func laneIndices(for intervals: [ClosedRange<CGFloat>]) -> [Int] {
        var laneEnds = [CGFloat]()
        return intervals.map { interval in
            if let lane = laneEnds.firstIndex(where: { $0 + 20 < interval.lowerBound }) {
                laneEnds[lane] = interval.upperBound
                return lane
            }
            laneEnds.append(interval.upperBound)
            return laneEnds.count - 1
        }
    }

    private static func stableID(for ids: [String]) -> String {
        ids.map { "\($0.utf16.count):\($0)" }.joined(separator: "|")
    }

    private static func average(_ values: [CGFloat]) -> CGFloat {
        values.reduce(0, +) / CGFloat(values.count)
    }

    private static func nodePositionOrder(_ left: TreeNodeLayout, _ right: TreeNodeLayout) -> Bool {
        if left.position.x != right.position.x { return left.position.x < right.position.x }
        return TreeRoutingGeometry.textPrecedes(left.id, right.id)
    }

    private static func familyIntervalOrder(_ left: Family, _ right: Family) -> Bool {
        if left.interval.lowerBound != right.interval.lowerBound {
            return left.interval.lowerBound < right.interval.lowerBound
        }
        if left.interval.upperBound != right.interval.upperBound {
            return left.interval.upperBound < right.interval.upperBound
        }
        return TreeRoutingGeometry.textPrecedes(left.id, right.id)
    }

    private static func familyRoutingOrder(_ left: Family, _ right: Family) -> Bool {
        let leftParentY = average(left.parentPorts.map(\.y))
        let rightParentY = average(right.parentPorts.map(\.y))
        if leftParentY != rightParentY { return leftParentY < rightParentY }
        let leftChildY = average(left.children.map(\.y))
        let rightChildY = average(right.children.map(\.y))
        if leftChildY != rightChildY { return leftChildY < rightChildY }
        return familyIntervalOrder(left, right)
    }
}
