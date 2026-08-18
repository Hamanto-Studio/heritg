import CoreGraphics
import Foundation

nonisolated enum TreeRoutingGeometry {
    static let clearance: CGFloat = 8
    static let epsilon: CGFloat = 0.001

    enum ObstacleKind: String, Equatable, Sendable {
        case avatar
        case nodeLabel
        case addControl
        case editControl
        case relationshipLabel
    }

    struct Obstacle: Equatable, Sendable {
        let kind: ObstacleKind
        let ownerID: String
        let rect: CGRect
    }

    struct ControlPlacement: Equatable, Sendable {
        enum Side: Equatable, Sendable {
            case left
            case right
        }

        let personID: String
        let side: Side
        let addCenter: CGPoint
        let editCenter: CGPoint
    }

    struct RelationshipLabel: Equatable, Sendable {
        let text: String
        let center: CGPoint
        let rect: CGRect
    }

    static func compareText(_ left: String, _ right: String) -> ComparisonResult {
        let leftUnits = Array(left.utf16)
        let rightUnits = Array(right.utf16)
        for (leftUnit, rightUnit) in zip(leftUnits, rightUnits) where leftUnit != rightUnit {
            return leftUnit < rightUnit ? .orderedAscending : .orderedDescending
        }
        if leftUnits.count == rightUnits.count { return .orderedSame }
        return leftUnits.count < rightUnits.count ? .orderedAscending : .orderedDescending
    }

    static func textPrecedes(_ left: String, _ right: String) -> Bool {
        compareText(left, right) == .orderedAscending
    }

    static func pointsEqual(_ left: CGPoint, _ right: CGPoint) -> Bool {
        abs(left.x - right.x) < epsilon && abs(left.y - right.y) < epsilon
    }

    static func segments(for rawPoints: [CGPoint]) -> [TreeConnector.Segment] {
        var points = [CGPoint]()
        for point in rawPoints where points.last.map({ !pointsEqual($0, point) }) ?? true {
            points.append(point)
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
        guard points.count > 1 else { return [] }
        return zip(points, points.dropFirst()).compactMap { start, end in
            let segment = TreeConnector.Segment(start: start, end: end)
            return segment.orientation == nil ? nil : segment
        }
    }

    static func expanded(_ rect: CGRect, by amount: CGFloat) -> CGRect {
        rect.insetBy(dx: -amount, dy: -amount)
    }

    static func rectsIntersect(_ left: CGRect, _ right: CGRect) -> Bool {
        left.minX < right.maxX && left.maxX > right.minX &&
            left.minY < right.maxY && left.maxY > right.minY
    }

    static func segmentIntersectsRect(
        _ segment: TreeConnector.Segment,
        _ rawRect: CGRect,
        clearance: CGFloat = clearance
    ) -> Bool {
        let rect = expanded(rawRect, by: clearance)
        switch segment.orientation {
        case .horizontal:
            guard segment.start.y > rect.minY + epsilon,
                  segment.start.y < rect.maxY - epsilon else { return false }
            let lower = max(min(segment.start.x, segment.end.x), rect.minX)
            let upper = min(max(segment.start.x, segment.end.x), rect.maxX)
            return lower < upper - epsilon
        case .vertical:
            guard segment.start.x > rect.minX + epsilon,
                  segment.start.x < rect.maxX - epsilon else { return false }
            let lower = max(min(segment.start.y, segment.end.y), rect.minY)
            let upper = min(max(segment.start.y, segment.end.y), rect.maxY)
            return lower < upper - epsilon
        case nil:
            return false
        }
    }

    private static func terminalContact(_ point: CGPoint, obstacle: Obstacle) -> Bool {
        let rect = obstacle.rect
        if obstacle.kind == .avatar {
            let vertical = (abs(point.x - rect.minX) < epsilon ||
                abs(point.x - rect.maxX) < epsilon) &&
                point.y >= rect.minY - epsilon && point.y <= rect.maxY + epsilon
            let horizontal = (abs(point.y - rect.minY) < epsilon ||
                abs(point.y - rect.maxY) < epsilon) &&
                point.x >= rect.minX - epsilon && point.x <= rect.maxX + epsilon
            return vertical || horizontal
        }
        return obstacle.kind == .nodeLabel &&
            abs(point.y - rect.maxY - 2) < epsilon &&
            point.x >= rect.minX - epsilon && point.x <= rect.maxX + epsilon
    }

    private static func permitsTerminalExit(
        _ segment: TreeConnector.Segment,
        obstacle: Obstacle,
        endpointIDs: Set<String>
    ) -> Bool {
        guard endpointIDs.contains(obstacle.ownerID),
              obstacle.kind == .avatar || obstacle.kind == .nodeLabel else { return false }
        for (point, other) in [(segment.start, segment.end), (segment.end, segment.start)] {
            guard terminalContact(point, obstacle: obstacle) else { continue }
            if obstacle.kind == .nodeLabel {
                return segment.orientation == .vertical && other.y > point.y
            }
            if segment.orientation == .horizontal {
                if abs(point.x - obstacle.rect.minX) < epsilon { return other.x < point.x }
                if abs(point.x - obstacle.rect.maxX) < epsilon { return other.x > point.x }
            }
            if segment.orientation == .vertical {
                if abs(point.y - obstacle.rect.minY) < epsilon { return other.y < point.y }
                if abs(point.y - obstacle.rect.maxY) < epsilon { return other.y > point.y }
            }
        }
        return false
    }

    static func hasForbiddenIntersection(
        _ segment: TreeConnector.Segment,
        obstacle: Obstacle,
        endpointIDs: Set<String>
    ) -> Bool {
        guard segmentIntersectsRect(segment, obstacle.rect) else { return false }
        guard permitsTerminalExit(segment, obstacle: obstacle, endpointIDs: endpointIDs) else {
            return true
        }
        return segmentIntersectsRect(segment, obstacle.rect, clearance: 0)
    }

    static func routeIsClear(
        _ segments: [TreeConnector.Segment],
        obstacles: [Obstacle],
        endpointIDs: Set<String> = []
    ) -> Bool {
        !segments.isEmpty && segments.allSatisfy { segment in
            obstacles.allSatisfy {
                !hasForbiddenIntersection(segment, obstacle: $0, endpointIDs: endpointIDs)
            }
        }
    }

    static func collinearlyOverlaps(
        _ left: TreeConnector.Segment,
        _ right: TreeConnector.Segment
    ) -> Bool {
        guard left.orientation == right.orientation else { return false }
        if left.orientation == .horizontal && abs(left.start.y - right.start.y) < epsilon {
            return max(min(left.start.x, left.end.x), min(right.start.x, right.end.x)) <
                min(max(left.start.x, left.end.x), max(right.start.x, right.end.x)) - epsilon
        }
        if left.orientation == .vertical && abs(left.start.x - right.start.x) < epsilon {
            return max(min(left.start.y, left.end.y), min(right.start.y, right.end.y)) <
                min(max(left.start.y, left.end.y), max(right.start.y, right.end.y)) - epsilon
        }
        return false
    }

    static func hasCollinearOverlap(
        _ route: [TreeConnector.Segment],
        occupied: [TreeConnector.Segment]
    ) -> Bool {
        route.contains { candidate in
            occupied.contains { collinearlyOverlaps(candidate, $0) }
        }
    }

    static func avatarRect(center: CGPoint) -> CGRect {
        return CGRect(
            x: center.x - TreeVisualMetrics.avatarRadius,
            y: center.y - TreeVisualMetrics.avatarRadius,
            width: TreeVisualMetrics.avatarDiameter,
            height: TreeVisualMetrics.avatarDiameter
        )
    }

    // The canonical role line is always reserved, even when selection hides its text.
    static func nodeLabelRect(for node: TreeNodeLayout) -> CGRect {
        let labelTop = node.position.y + TreeVisualMetrics.nodeLabelTopSpacing +
            TreeVisualMetrics.avatarRadius
        let labelBottom = node.position.y + (node.person.lifeSummary == nil ? 82 : 100)
        return CGRect(
            x: node.position.x - TreeVisualMetrics.nodeLabelWidth / 2,
            y: labelTop,
            width: TreeVisualMetrics.nodeLabelWidth,
            height: labelBottom - labelTop
        )
    }

    static func controlRect(center: CGPoint) -> CGRect {
        CGRect(x: center.x - 22, y: center.y - 22, width: 44, height: 44)
    }

    static func parentPortY(for node: TreeNodeLayout) -> CGFloat {
        nodeLabelRect(for: node).maxY + 2
    }

    static func relationshipLabelRect(text: String, center: CGPoint) -> CGRect {
        let width = max(44, min(240, CGFloat(text.utf16.count) * 6.2 + 14))
        return CGRect(x: center.x - width / 2, y: center.y - 10, width: width, height: 20)
    }

    static func point(_ point: CGPoint, isOn segment: TreeConnector.Segment) -> Bool {
        switch segment.orientation {
        case .horizontal:
            return abs(point.y - segment.start.y) < epsilon &&
                point.x >= min(segment.start.x, segment.end.x) - epsilon &&
                point.x <= max(segment.start.x, segment.end.x) + epsilon
        case .vertical:
            return abs(point.x - segment.start.x) < epsilon &&
                point.y >= min(segment.start.y, segment.end.y) - epsilon &&
                point.y <= max(segment.start.y, segment.end.y) + epsilon
        case nil:
            return false
        }
    }
}
