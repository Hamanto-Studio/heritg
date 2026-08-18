import CoreGraphics
import SwiftUI

nonisolated enum TreeConnectorStyle {
    static let width: CGFloat = 2
    static let cornerRadius: CGFloat = 12
    static let junctionRadius: CGFloat = 2
    static let crossingRadius: CGFloat = 5
    static let familyColor = "#9c825f"
    static let partnerColor = "#b47c76"
    static let siblingColor = "#78956c"
    static let siblingDash: [CGFloat] = [6, 7]

    struct ConnectorPath: Equatable, Sendable {
        let points: [CGPoint]
        let segmentIndexes: [Int]
    }

    private struct GraphEdge {
        let sourceIndex: Int
        let startKey: String
        let endKey: String
    }

    private struct GraphNode {
        let point: CGPoint
        var edgeIndexes: [Int]
    }

    private static func stableCoordinate(_ value: CGFloat) -> CGFloat {
        let normalized = abs(value) < TreeRoutingGeometry.epsilon ? 0 : value
        return (normalized * 1_000).rounded() / 1_000
    }

    private static func pointKey(_ point: CGPoint) -> String {
        "\(stableCoordinate(point.x)):\(stableCoordinate(point.y))"
    }

    private static func pointPrecedes(_ left: CGPoint, _ right: CGPoint) -> Bool {
        left.y == right.y ? left.x < right.x : left.y < right.y
    }

    static func branchJunctions(in segments: [TreeConnector.Segment]) -> [CGPoint] {
        var candidates = [String: CGPoint]()
        for segment in segments {
            candidates[pointKey(segment.start)] = segment.start
            candidates[pointKey(segment.end)] = segment.end
        }
        for firstIndex in segments.indices {
            for secondIndex in segments.indices where secondIndex > firstIndex {
                let first = segments[firstIndex]
                let second = segments[secondIndex]
                guard first.orientation != nil, second.orientation != nil,
                      first.orientation != second.orientation else { continue }
                let horizontal = first.orientation == .horizontal ? first : second
                let vertical = first.orientation == .vertical ? first : second
                let point = CGPoint(x: vertical.start.x, y: horizontal.start.y)
                if TreeRoutingGeometry.point(point, isOn: horizontal),
                   TreeRoutingGeometry.point(point, isOn: vertical) {
                    candidates[pointKey(point)] = point
                }
            }
        }
        return candidates.values.filter { point in
            var directions = Set<String>()
            for segment in segments where TreeRoutingGeometry.point(point, isOn: segment) {
                for other in [segment.start, segment.end] {
                    if other.x < point.x - TreeRoutingGeometry.epsilon { directions.insert("left") }
                    if other.x > point.x + TreeRoutingGeometry.epsilon { directions.insert("right") }
                    if other.y < point.y - TreeRoutingGeometry.epsilon { directions.insert("up") }
                    if other.y > point.y + TreeRoutingGeometry.epsilon { directions.insert("down") }
                }
            }
            return directions.count >= 3
        }.sorted { left, right in
            left.y == right.y ? left.x < right.x : left.y < right.y
        }
    }

    private static func simplified(_ rawPoints: [CGPoint]) -> [CGPoint] {
        var points = rawPoints.reduce(into: [CGPoint]()) { result, point in
            if result.last.map({ !TreeRoutingGeometry.pointsEqual($0, point) }) ?? true {
                result.append(point)
            }
        }
        var index = 1
        while index < points.count - 1 {
            let previous = points[index - 1]
            let current = points[index]
            let next = points[index + 1]
            if previous.x == current.x && current.x == next.x ||
                previous.y == current.y && current.y == next.y {
                points.remove(at: index)
            } else {
                index += 1
            }
        }
        return points
    }

    static func connectorPaths(for segments: [TreeConnector.Segment]) -> [ConnectorPath] {
        var nodes = [String: GraphNode]()
        var edges = [GraphEdge]()
        func ensureNode(_ point: CGPoint) -> String {
            let key = pointKey(point)
            if nodes[key] == nil { nodes[key] = GraphNode(point: point, edgeIndexes: []) }
            return key
        }
        for (sourceIndex, segment) in segments.enumerated()
            where !TreeRoutingGeometry.pointsEqual(segment.start, segment.end) {
            let startKey = ensureNode(segment.start)
            let endKey = ensureNode(segment.end)
            let edgeIndex = edges.count
            edges.append(GraphEdge(sourceIndex: sourceIndex, startKey: startKey, endKey: endKey))
            nodes[startKey]?.edgeIndexes.append(edgeIndex)
            nodes[endKey]?.edgeIndexes.append(edgeIndex)
        }

        func otherKey(_ edge: GraphEdge, from key: String) -> String {
            edge.startKey == key ? edge.endKey : edge.startKey
        }
        func sortedEdges(_ indexes: [Int], from key: String) -> [Int] {
            indexes.sorted { left, right in
                guard let leftPoint = nodes[otherKey(edges[left], from: key)]?.point,
                      let rightPoint = nodes[otherKey(edges[right], from: key)]?.point else {
                    return left < right
                }
                return pointPrecedes(leftPoint, rightPoint)
            }
        }

        var visited = Set<Int>()
        var results = [ConnectorPath]()
        func walk(from startKey: String, firstEdgeIndex: Int) {
            guard let start = nodes[startKey]?.point else { return }
            var pathPoints = [start]
            var sourceIndexes = [Int]()
            var currentKey = startKey
            var edgeIndex = firstEdgeIndex
            while !visited.contains(edgeIndex) {
                visited.insert(edgeIndex)
                let edge = edges[edgeIndex]
                sourceIndexes.append(edge.sourceIndex)
                currentKey = otherKey(edge, from: currentKey)
                guard let currentNode = nodes[currentKey] else { break }
                pathPoints.append(currentNode.point)
                guard currentNode.edgeIndexes.count == 2,
                      let next = sortedEdges(currentNode.edgeIndexes, from: currentKey)
                      .first(where: { !visited.contains($0) }) else { break }
                edgeIndex = next
            }
            let points = simplified(pathPoints)
            if points.count > 1 {
                results.append(ConnectorPath(points: points, segmentIndexes: sourceIndexes))
            }
        }

        for (key, node) in nodes.filter({ $0.value.edgeIndexes.count != 2 })
            .sorted(by: { pointPrecedes($0.value.point, $1.value.point) }) {
            for edgeIndex in sortedEdges(node.edgeIndexes, from: key) where !visited.contains(edgeIndex) {
                walk(from: key, firstEdgeIndex: edgeIndex)
            }
        }
        for (edgeIndex, edge) in edges.enumerated() where !visited.contains(edgeIndex) {
            walk(from: edge.startKey, firstEdgeIndex: edgeIndex)
        }
        return results
    }

    private static func distance(_ left: CGPoint, _ right: CGPoint) -> CGFloat {
        abs(left.x - right.x) + abs(left.y - right.y)
    }

    private static func pointToward(_ from: CGPoint, _ to: CGPoint, amount: CGFloat) -> CGPoint {
        let xDirection: CGFloat = to.x < from.x ? -1 : to.x > from.x ? 1 : 0
        let yDirection: CGFloat = to.y < from.y ? -1 : to.y > from.y ? 1 : 0
        return CGPoint(
            x: from.x + xDirection * min(amount, abs(to.x - from.x)),
            y: from.y + yDirection * min(amount, abs(to.y - from.y))
        )
    }

    static func roundedPath(
        for points: [CGPoint],
        radius: CGFloat = cornerRadius,
        transform: (CGPoint) -> CGPoint = { $0 }
    ) -> Path {
        Path { path in
            guard let first = points.first else { return }
            path.move(to: transform(first))
            guard points.count > 1 else { return }
            if points.count > 2 {
                for index in 1..<(points.count - 1) {
                    let previous = points[index - 1]
                    let current = points[index]
                    let next = points[index + 1]
                    guard previous.x != next.x, previous.y != next.y else {
                        path.addLine(to: transform(current))
                        continue
                    }
                    let cornerRadius = min(
                        radius,
                        distance(previous, current) / 2,
                        distance(current, next) / 2
                    )
                    let before = pointToward(current, previous, amount: cornerRadius)
                    let after = pointToward(current, next, amount: cornerRadius)
                    path.addLine(to: transform(before))
                    path.addQuadCurve(to: transform(after), control: transform(current))
                }
            }
            path.addLine(to: transform(points[points.count - 1]))
        }
    }
}
