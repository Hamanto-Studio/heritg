import CoreGraphics
import Foundation
import SwiftUI

struct TreeConnectionPlan: Equatable {
    struct Family: Identifiable, Equatable {
        let id: String
        let parentIDs: [String]
        let childIDs: [String]
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
    }

    struct Band: Hashable, Comparable {
        let parentY: Int
        let childY: Int

        static func < (lhs: Band, rhs: Band) -> Bool {
            (lhs.parentY, lhs.childY) < (rhs.parentY, rhs.childY)
        }
    }

    private struct ParentSet: Hashable {
        let ids: [String]
    }

    let families: [Family]
    let nonParentEdges: [TreeEdgeLayout]
    let crossings: [CGPoint]
    let showsRelationshipLabels: Bool

    static func make(from layout: TreeLayoutResult) -> TreeConnectionPlan {
        make(from: layout, showsRelationshipLabels: true)
    }

    static func make(
        from layout: TreeLayoutResult,
        showsRelationshipLabels: Bool
    ) -> TreeConnectionPlan {
        let positions = Dictionary(uniqueKeysWithValues: layout.nodes.map { ($0.id, $0.position) })
        let nodesByID = Dictionary(uniqueKeysWithValues: layout.nodes.map { ($0.id, $0) })
        let parentEdgesByChild = Dictionary(
            grouping: layout.edges.filter { $0.kind == .parent },
            by: \TreeEdgeLayout.toPersonID
        )
        var childrenByParentSet = [ParentSet: Set<String>]()

        for (childID, edges) in parentEdgesByChild {
            let parentIDs = Array(Set(edges.map(\.fromPersonID))).sorted()
            guard !parentIDs.isEmpty, positions[childID] != nil else { continue }
            childrenByParentSet[ParentSet(ids: parentIDs), default: []].insert(childID)
        }

        var families = childrenByParentSet.compactMap { parentSet, childIDs -> Family? in
            let parents = parentSet.ids.compactMap { id in positions[id].map { (id, $0) } }
                .sorted { ($0.1.x, $0.0) < ($1.1.x, $1.0) }
            let children = childIDs.compactMap { id in positions[id].map { (id, $0) } }
                .sorted { ($0.1.x, $0.0) < ($1.1.x, $1.0) }
            guard !parents.isEmpty, !children.isEmpty,
                  let minX = (parents.map(\.1) + children.map(\.1)).map(\.x).min(),
                  let maxX = (parents.map(\.1) + children.map(\.1)).map(\.x).max() else {
                return nil
            }

            let parentY = parents.map(\.1.y).reduce(0, +) / CGFloat(parents.count)
            let childY = children.map(\.1.y).reduce(0, +) / CGFloat(children.count)
            let parentIDs = parents.map(\.0)
            return Family(
                id: stableID(for: parentIDs),
                parentIDs: parentIDs,
                childIDs: children.map(\.0),
                parentCenters: parents.map(\.1),
                parentPorts: parents.map(\.1),
                parentLabelBottoms: parentIDs.map { parentID in
                    TreeVisualMetrics.nodeLabelBottomOffset(
                        showsRelationship: showsRelationshipLabels,
                        showsLifeSummary: nodesByID[parentID]?.person.lifeSummary != nil
                    ) + 2
                },
                children: children.map(\.1),
                interval: minX...maxX,
                band: Band(parentY: Int(parentY.rounded()), childY: Int(childY.rounded()))
            )
        }

        for band in Set(families.map(\.band)).sorted() {
            let indices = families.indices.filter { families[$0].band == band }.sorted {
                let lhs = families[$0]
                let rhs = families[$1]
                if lhs.interval.lowerBound == rhs.interval.lowerBound {
                    if lhs.interval.upperBound == rhs.interval.upperBound {
                        return lhs.id < rhs.id
                    }
                    return lhs.interval.upperBound < rhs.interval.upperBound
                }
                return lhs.interval.lowerBound < rhs.interval.lowerBound
            }
            let lanes = TreeConnector.laneIndices(
                for: indices.map { families[$0].interval },
                clearance: 20
            )
            let laneCount = (lanes.max() ?? 0) + 1
            for (index, lane) in zip(indices, lanes) {
                families[index].laneIndex = lane
                families[index].laneCount = laneCount
            }
        }

        let familiesByParent = families.indices.reduce(into: [String: [Int]]()) { result, index in
            for parentID in families[index].parentIDs {
                result[parentID, default: []].append(index)
            }
        }
        for (parentID, indices) in familiesByParent where indices.count > 1 {
            let sortedIndices = indices.sorted { families[$0].id < families[$1].id }
            for (portIndex, familyIndex) in sortedIndices.enumerated() {
                guard let pointIndex = families[familyIndex].parentIDs.firstIndex(of: parentID) else {
                    continue
                }
                let centeredPort = CGFloat(portIndex) - CGFloat(sortedIndices.count - 1) / 2
                families[familyIndex].parentPorts[pointIndex].x += centeredPort * 12
            }
        }

        for index in families.indices {
            let parentStartY = zip(
                families[index].parentCenters,
                families[index].parentLabelBottoms
            ).map { $0.y + $1 }.max() ?? 0
            let childTopY = families[index].children.map {
                $0.y - TreeVisualMetrics.avatarRadius
            }.min() ?? 0
            let laneCount = families[index].laneCount
            let lane = families[index].laneIndex
            let availableHeight = max(childTopY - parentStartY - 32, 0)
            let trackSpacing = laneCount > 1
                ? max(2, min(12, availableHeight / CGFloat((laneCount - 1) * 2)))
                : 0
            let parentJoinY = parentStartY + 8 + CGFloat(lane) * trackSpacing
            let childRailY = childTopY - 8
                - CGFloat(laneCount - 1 - lane) * trackSpacing
            let centeredLane = CGFloat(lane) - CGFloat(laneCount - 1) / 2
            let baseTrunkX = families[index].parentPorts.map(\.x).reduce(0, +)
                / CGFloat(families[index].parentPorts.count)
            let trunkX = baseTrunkX + centeredLane * 8
            let minParentX = min(families[index].parentPorts.map(\.x).min() ?? trunkX, trunkX)
            let maxParentX = max(families[index].parentPorts.map(\.x).max() ?? trunkX, trunkX)
            let minChildX = min(families[index].children.map(\.x).min() ?? trunkX, trunkX)
            let maxChildX = max(families[index].children.map(\.x).max() ?? trunkX, trunkX)
            let geometry = TreeConnector.FamilyGeometry(
                parentJoinY: parentJoinY,
                childRailY: childRailY,
                trunkX: trunkX,
                parentRange: minParentX...maxParentX,
                childRange: minChildX...maxChildX
            )

            families[index].branchOffset = childRailY - (parentStartY + childTopY) / 2
            families[index].segments = TreeConnector.familySegments(
                parentSources: families[index].parentCenters,
                parentLabelBottoms: families[index].parentLabelBottoms,
                parents: families[index].parentPorts,
                children: families[index].children,
                avatarRadius: TreeVisualMetrics.avatarRadius,
                scale: 1,
                geometry: geometry
            )
            families[index].junctions = [
                CGPoint(x: trunkX, y: parentJoinY),
                CGPoint(x: trunkX, y: childRailY),
            ]
        }

        families.sort { $0.id < $1.id }
        separateCollinearVerticalSegments(in: &families)
        let crossings = crossingPoints(in: families)

        return TreeConnectionPlan(
            families: families,
            nonParentEdges: layout.edges.filter { $0.kind != .parent }.sorted { $0.id < $1.id },
            crossings: crossings,
            showsRelationshipLabels: showsRelationshipLabels
        )
    }

    var connectorBounds: CGRect {
        var bounds = CGRect.null
        for family in families {
            bounds = bounds.union(TreeConnector.path(for: family.segments).boundingRect)
        }
        for edge in nonParentEdges {
            bounds = bounds.union(TreeConnector.path(
                kind: edge.kind,
                from: edge.from,
                to: edge.to,
                avatarRadius: TreeVisualMetrics.avatarRadius
            ).boundingRect)
        }
        return bounds
    }

    func drawingBounds(including nodes: [TreeNodeLayout]) -> CGRect {
        var bounds = connectorBounds
        let nodeHalfWidth = TreeVisualMetrics.nodeLabelWidth / 2
        let nodeTop = TreeVisualMetrics.avatarRadius

        for node in nodes {
            let nodeBottom = TreeVisualMetrics.nodeLabelBottomOffset(
                showsRelationship: showsRelationshipLabels,
                showsLifeSummary: node.person.lifeSummary != nil
            )
            bounds = bounds.union(CGRect(
                x: node.position.x - nodeHalfWidth,
                y: node.position.y - nodeTop,
                width: nodeHalfWidth * 2,
                height: nodeTop + nodeBottom
            ))
        }
        if bounds.isNull {
            bounds = CGRect(x: -100, y: -100, width: 200, height: 200)
        }
        return bounds.insetBy(dx: -100, dy: -100)
    }

    private static func stableID(for ids: [String]) -> String {
        ids.map { "\($0.count):\($0)" }.joined(separator: "|")
    }

    private static func crossingPoints(in families: [Family]) -> [CGPoint] {
        var points = [CGPoint]()
        for firstIndex in families.indices {
            for secondIndex in families.indices where secondIndex > firstIndex {
                for first in families[firstIndex].segments {
                    for second in families[secondIndex].segments {
                        guard let point = crossingPoint(first, second),
                              !points.contains(point) else { continue }
                        points.append(point)
                    }
                }
            }
        }
        return points.sorted { ($0.y, $0.x) < ($1.y, $1.x) }
    }

    private static func separateCollinearVerticalSegments(in families: inout [Family]) {
        var occupied = [TreeConnector.Segment]()
        for familyIndex in families.indices {
            var routed = [TreeConnector.Segment]()
            for segment in families[familyIndex].segments {
                guard segment.orientation == .vertical else {
                    routed.append(segment)
                    continue
                }

                let offsets = [CGFloat(0)] + (1...20).flatMap {
                    [CGFloat($0) * 6, CGFloat($0) * -6]
                }
                let routedSegment = offsets.lazy.map { offset in
                    TreeConnector.Segment(
                        start: CGPoint(x: segment.start.x + offset, y: segment.start.y),
                        end: CGPoint(x: segment.end.x + offset, y: segment.end.y)
                    )
                }.first { candidate in
                    !occupied.contains { collinearlyOverlaps(candidate, $0) }
                } ?? segment

                if routedSegment.start.x != segment.start.x {
                    routed.append(TreeConnector.Segment(
                        start: segment.start,
                        end: routedSegment.start
                    ))
                    routed.append(routedSegment)
                    routed.append(TreeConnector.Segment(
                        start: routedSegment.end,
                        end: segment.end
                    ))
                } else {
                    routed.append(segment)
                }
                occupied.append(routedSegment)
            }
            families[familyIndex].segments = routed
        }
    }

    private static func collinearlyOverlaps(
        _ first: TreeConnector.Segment,
        _ second: TreeConnector.Segment
    ) -> Bool {
        guard first.orientation == .vertical,
              second.orientation == .vertical,
              first.start.x == second.start.x else { return false }
        let firstMinY = min(first.start.y, first.end.y)
        let firstMaxY = max(first.start.y, first.end.y)
        let secondMinY = min(second.start.y, second.end.y)
        let secondMaxY = max(second.start.y, second.end.y)
        return max(firstMinY, secondMinY) < min(firstMaxY, secondMaxY)
    }

    private static func crossingPoint(
        _ first: TreeConnector.Segment,
        _ second: TreeConnector.Segment
    ) -> CGPoint? {
        let horizontal: TreeConnector.Segment
        let vertical: TreeConnector.Segment
        switch (first.orientation, second.orientation) {
        case (.horizontal, .vertical):
            horizontal = first
            vertical = second
        case (.vertical, .horizontal):
            horizontal = second
            vertical = first
        default:
            return nil
        }

        let horizontalRange: ClosedRange<CGFloat> = min(horizontal.start.x, horizontal.end.x)...max(horizontal.start.x, horizontal.end.x)
        let verticalRange: ClosedRange<CGFloat> = min(vertical.start.y, vertical.end.y)...max(vertical.start.y, vertical.end.y)
        guard vertical.start.x >= horizontalRange.lowerBound,
              vertical.start.x <= horizontalRange.upperBound,
              horizontal.start.y >= verticalRange.lowerBound,
              horizontal.start.y <= verticalRange.upperBound else {
            return nil
        }
        return CGPoint(x: vertical.start.x, y: horizontal.start.y)
    }
}
