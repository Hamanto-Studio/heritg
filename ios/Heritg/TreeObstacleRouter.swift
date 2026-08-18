import CoreGraphics
import Foundation

nonisolated enum TreeObstacleRouter {
    private static let coordinatePadding: CGFloat = 2
    private static let bendPenalty: CGFloat = 24

    static func sortedObstacles(
        _ obstacles: [TreeRoutingGeometry.Obstacle]
    ) -> [TreeRoutingGeometry.Obstacle] {
        obstacles.sorted { left, right in
            let leftKey = "\(left.kind.rawValue):\(left.ownerID)"
            let rightKey = "\(right.kind.rawValue):\(right.ownerID)"
            let comparison = TreeRoutingGeometry.compareText(leftKey, rightKey)
            if comparison != .orderedSame { return comparison == .orderedAscending }
            if left.rect.minY != right.rect.minY { return left.rect.minY < right.rect.minY }
            if left.rect.minX != right.rect.minX { return left.rect.minX < right.rect.minX }
            if left.rect.height != right.rect.height { return left.rect.height < right.rect.height }
            return left.rect.width < right.rect.width
        }
    }

    private static func unique(_ values: [CGFloat]) -> [CGFloat] {
        values.sorted().reduce(into: []) { result, value in
            if result.last.map({ abs($0 - value) >= TreeRoutingGeometry.epsilon }) ?? true {
                result.append(value)
            }
        }
    }

    private static func terminalContact(
        _ point: CGPoint,
        obstacle: TreeRoutingGeometry.Obstacle
    ) -> Bool {
        let rect = obstacle.rect
        if obstacle.kind == .avatar {
            return ((abs(point.x - rect.minX) < TreeRoutingGeometry.epsilon ||
                abs(point.x - rect.maxX) < TreeRoutingGeometry.epsilon) &&
                point.y >= rect.minY - TreeRoutingGeometry.epsilon &&
                point.y <= rect.maxY + TreeRoutingGeometry.epsilon) ||
                ((abs(point.y - rect.minY) < TreeRoutingGeometry.epsilon ||
                abs(point.y - rect.maxY) < TreeRoutingGeometry.epsilon) &&
                point.x >= rect.minX - TreeRoutingGeometry.epsilon &&
                point.x <= rect.maxX + TreeRoutingGeometry.epsilon)
        }
        return obstacle.kind == .nodeLabel &&
            abs(point.y - rect.maxY - 2) < TreeRoutingGeometry.epsilon &&
            point.x >= rect.minX - TreeRoutingGeometry.epsilon &&
            point.x <= rect.maxX + TreeRoutingGeometry.epsilon
    }

    private static func endpointIsBlocked(
        _ point: CGPoint,
        obstacles: [TreeRoutingGeometry.Obstacle],
        endpointIDs: Set<String>
    ) -> Bool {
        obstacles.contains { obstacle in
            let rect = TreeRoutingGeometry.expanded(
                obstacle.rect,
                by: TreeRoutingGeometry.clearance
            )
            let inside = point.x > rect.minX + TreeRoutingGeometry.epsilon &&
                point.x < rect.maxX - TreeRoutingGeometry.epsilon &&
                point.y > rect.minY + TreeRoutingGeometry.epsilon &&
                point.y < rect.maxY - TreeRoutingGeometry.epsilon
            guard inside else { return false }
            return !endpointIDs.contains(obstacle.ownerID) ||
                !terminalContact(point, obstacle: obstacle)
        }
    }

    private static func accepted(
        _ route: [TreeConnector.Segment],
        obstacles: [TreeRoutingGeometry.Obstacle],
        endpointIDs: Set<String>,
        occupied: [TreeConnector.Segment]
    ) -> Bool {
        TreeRoutingGeometry.routeIsClear(route, obstacles: obstacles, endpointIDs: endpointIDs) &&
            !TreeRoutingGeometry.hasCollinearOverlap(route, occupied: occupied)
    }

    private static func fastCandidates(
        start: CGPoint,
        end: CGPoint,
        obstacles: [TreeRoutingGeometry.Obstacle],
        occupied: [TreeConnector.Segment]
    ) -> [[TreeConnector.Segment]] {
        let clearance = TreeRoutingGeometry.clearance + coordinatePadding
        if start.y == end.y {
            let values = unique(
                obstacles.flatMap { [$0.rect.minY - clearance, $0.rect.maxY + clearance] } +
                    occupied.filter { $0.orientation == .horizontal }
                    .flatMap { [$0.start.y - 6, $0.start.y + 6] }
            ).sorted { abs($0 - start.y) == abs($1 - start.y) ? $0 < $1 : abs($0 - start.y) < abs($1 - start.y) }
            return values.map { y in
                TreeRoutingGeometry.segments(for: [
                    start, CGPoint(x: start.x, y: y), CGPoint(x: end.x, y: y), end,
                ])
            }
        }
        if start.x == end.x {
            let values = unique(
                obstacles.flatMap { [$0.rect.minX - clearance, $0.rect.maxX + clearance] } +
                    occupied.filter { $0.orientation == .vertical }
                    .flatMap { [$0.start.x - 6, $0.start.x + 6] }
            ).sorted { abs($0 - start.x) == abs($1 - start.x) ? $0 < $1 : abs($0 - start.x) < abs($1 - start.x) }
            return values.map { x in
                TreeRoutingGeometry.segments(for: [
                    start, CGPoint(x: x, y: start.y), CGPoint(x: x, y: end.y), end,
                ])
            }
        }
        return []
    }

    private static func escapeXCoordinates(
        point: CGPoint,
        channelY: CGFloat,
        obstacles: [TreeRoutingGeometry.Obstacle],
        occupied: [TreeConnector.Segment]
    ) -> [CGFloat] {
        let lowerY = min(point.y, channelY)
        let upperY = max(point.y, channelY)
        let blockers = obstacles.filter { obstacle in
            point.x > obstacle.rect.minX - TreeRoutingGeometry.clearance &&
                point.x < obstacle.rect.maxX + TreeRoutingGeometry.clearance &&
                lowerY <= obstacle.rect.maxY && upperY >= obstacle.rect.minY
        }
        var candidates = [point.x]
        for blocker in blockers {
            candidates.append(
                blocker.rect.minX - TreeRoutingGeometry.clearance - coordinatePadding
            )
            candidates.append(
                blocker.rect.maxX + TreeRoutingGeometry.clearance + coordinatePadding
            )
        }
        for segment in occupied where segment.orientation == .vertical {
            candidates += [segment.start.x - 6, segment.start.x + 6]
        }
        let sortedCandidates = unique(candidates).sorted { left, right in
            let leftDistance = abs(left - point.x)
            let rightDistance = abs(right - point.x)
            return leftDistance == rightDistance ? left < right : leftDistance < rightDistance
        }
        var values = Array(sortedCandidates.prefix(9))
        if let minX = obstacles.map(\.rect.minX).min(),
           let maxX = obstacles.map(\.rect.maxX).max() {
            for value in [
                minX - TreeRoutingGeometry.clearance - coordinatePadding,
                maxX + TreeRoutingGeometry.clearance + coordinatePadding,
            ] where !values.contains(where: { abs($0 - value) < TreeRoutingGeometry.epsilon }) {
                values.append(value)
            }
        }
        return values
    }

    private static func fallbackRoute(
        start: CGPoint,
        end: CGPoint,
        obstacles: [TreeRoutingGeometry.Obstacle],
        occupied: [TreeConnector.Segment],
        isAccepted: ([TreeConnector.Segment]) -> Bool
    ) -> [TreeConnector.Segment]? {
        if start.x == end.x || start.y == end.y {
            let direct = TreeRoutingGeometry.segments(for: [start, end])
            if isAccepted(direct) { return direct }
        }
        let minObstacleY = min(obstacles.map(\.rect.minY).min() ?? start.y, start.y, end.y)
        let maxObstacleY = max(obstacles.map(\.rect.maxY).max() ?? end.y, start.y, end.y)
        let midpointY = (start.y + end.y) / 2
        var channelCandidates = [
            min(start.y, end.y) - 40,
            max(start.y, end.y) + 40,
            minObstacleY - TreeRoutingGeometry.clearance - coordinatePadding,
            maxObstacleY + TreeRoutingGeometry.clearance + coordinatePadding,
        ]
        for obstacle in obstacles {
            channelCandidates.append(
                obstacle.rect.minY - TreeRoutingGeometry.clearance - coordinatePadding
            )
            channelCandidates.append(
                obstacle.rect.maxY + TreeRoutingGeometry.clearance + coordinatePadding
            )
        }
        for segment in occupied where segment.orientation == .horizontal {
            channelCandidates += [segment.start.y - 6, segment.start.y + 6]
        }
        let channelYs = unique(channelCandidates).sorted { left, right in
            let leftDistance = abs(left - midpointY)
            let rightDistance = abs(right - midpointY)
            return leftDistance == rightDistance ? left < right : leftDistance < rightDistance
        }
        for y in channelYs {
            for startX in escapeXCoordinates(
                point: start,
                channelY: y,
                obstacles: obstacles,
                occupied: occupied
            ) {
                for endX in escapeXCoordinates(
                    point: end,
                    channelY: y,
                    obstacles: obstacles,
                    occupied: occupied
                ) {
                    let candidate = TreeRoutingGeometry.segments(for: [
                        start,
                        CGPoint(x: startX, y: start.y),
                        CGPoint(x: startX, y: y),
                        CGPoint(x: endX, y: y),
                        CGPoint(x: endX, y: end.y),
                        end,
                    ])
                    if isAccepted(candidate) { return candidate }
                }
            }
        }
        return nil
    }

    static func preferredRoute(
        start: CGPoint,
        end: CGPoint,
        obstacles: [TreeRoutingGeometry.Obstacle],
        endpointIDs: Set<String>,
        occupied: [TreeConnector.Segment] = []
    ) -> [TreeConnector.Segment]? {
        let orderedObstacles = sortedObstacles(obstacles)
        guard !endpointIsBlocked(start, obstacles: orderedObstacles, endpointIDs: endpointIDs),
              !endpointIsBlocked(end, obstacles: orderedObstacles, endpointIDs: endpointIDs) else {
            return nil
        }
        let direct = TreeRoutingGeometry.segments(for: [start, end])
        if accepted(
            direct,
            obstacles: orderedObstacles,
            endpointIDs: endpointIDs,
            occupied: occupied
        ) { return direct }
        if let quick = fastCandidates(
            start: start,
            end: end,
            obstacles: orderedObstacles,
            occupied: occupied
        ).first(where: {
            accepted($0, obstacles: orderedObstacles, endpointIDs: endpointIDs, occupied: occupied)
        }) { return quick }
        return fallbackRoute(
            start: start,
            end: end,
            obstacles: orderedObstacles,
            occupied: occupied
        ) {
            accepted($0, obstacles: orderedObstacles, endpointIDs: endpointIDs, occupied: occupied)
        }
    }

    static func routeBetweenPeople(
        left: CGPoint,
        right: CGPoint,
        endpointIDs: Set<String>,
        obstacles: [TreeRoutingGeometry.Obstacle],
        occupied: [TreeConnector.Segment],
        radius: CGFloat
    ) -> [TreeConnector.Segment]? {
        let candidates: [(penalty: CGFloat, start: CGPoint, end: CGPoint)] = [
            (0, CGPoint(x: left.x + radius, y: left.y), CGPoint(x: right.x - radius, y: right.y)),
            (20, CGPoint(x: left.x + radius, y: left.y - 12), CGPoint(x: right.x - radius, y: right.y - 12)),
            (40, CGPoint(x: left.x + radius, y: left.y + 12), CGPoint(x: right.x - radius, y: right.y + 12)),
            (80, CGPoint(x: left.x, y: left.y - radius), CGPoint(x: right.x, y: right.y - radius)),
            (90, CGPoint(x: left.x - 12, y: left.y - radius), CGPoint(x: right.x - 12, y: right.y - radius)),
            (100, CGPoint(x: left.x + 12, y: left.y - radius), CGPoint(x: right.x + 12, y: right.y - radius)),
            (120, CGPoint(x: left.x - radius, y: left.y), CGPoint(x: right.x + radius, y: right.y)),
            (160, CGPoint(x: left.x, y: left.y + radius), CGPoint(x: right.x, y: right.y + radius)),
        ]
        var best: (segments: [TreeConnector.Segment], cost: CGFloat)?
        for candidate in candidates {
            guard let segments = preferredRoute(
                start: candidate.start,
                end: candidate.end,
                obstacles: obstacles,
                endpointIDs: endpointIDs,
                occupied: occupied
            ) else { continue }
            let cost = segments.reduce(0) { $0 + $1.length } +
                CGFloat(max(segments.count - 1, 0)) * bendPenalty + candidate.penalty
            if best == nil || cost < best!.cost { best = (segments, cost) }
        }
        return best?.segments
    }

    static func placeRelationshipLabel(
        relationshipID: String,
        text: String,
        segments: [TreeConnector.Segment],
        obstacles: [TreeRoutingGeometry.Obstacle],
        occupied: [TreeConnector.Segment]
    ) -> (label: TreeRoutingGeometry.RelationshipLabel, obstacle: TreeRoutingGeometry.Obstacle)? {
        let horizontal = segments.filter { $0.orientation == .horizontal }.sorted { left, right in
            if left.length != right.length { return left.length > right.length }
            if left.start.y != right.start.y { return left.start.y < right.start.y }
            return left.start.x < right.start.x
        }
        let fractions = (1...19).map { CGFloat($0) / 20 }.sorted { left, right in
            let leftDistance = abs(left - 0.5)
            let rightDistance = abs(right - 0.5)
            return leftDistance == rightDistance ? left < right : leftDistance < rightDistance
        }
        for segment in horizontal {
            for fraction in fractions {
                let anchor = CGPoint(
                    x: segment.start.x + (segment.end.x - segment.start.x) * fraction,
                    y: segment.start.y
                )
                for offset: CGFloat in [-14, -22, -40, -58, -76, -94] {
                    let center = CGPoint(x: anchor.x, y: anchor.y + offset)
                    let rect = TreeRoutingGeometry.relationshipLabelRect(text: text, center: center)
                    let clearsObstacles = obstacles.allSatisfy {
                        !TreeRoutingGeometry.rectsIntersect(
                            TreeRoutingGeometry.expanded($0.rect, by: TreeRoutingGeometry.clearance),
                            rect
                        )
                    }
                    let clearsRoutes = occupied.allSatisfy {
                        !TreeRoutingGeometry.segmentIntersectsRect($0, rect, clearance: 2)
                    }
                    if clearsObstacles && clearsRoutes {
                        let label = TreeRoutingGeometry.RelationshipLabel(
                            text: text,
                            center: center,
                            rect: rect
                        )
                        return (
                            label,
                            TreeRoutingGeometry.Obstacle(
                                kind: .relationshipLabel,
                                ownerID: relationshipID,
                                rect: rect
                            )
                        )
                    }
                }
            }
        }
        return nil
    }

    static func splitAtAttachmentPoints(
        _ segments: [TreeConnector.Segment]
    ) -> [TreeConnector.Segment] {
        let endpoints = segments.flatMap { [$0.start, $0.end] }
        return segments.flatMap { segment -> [TreeConnector.Segment] in
            let points = endpoints.filter { TreeRoutingGeometry.point($0, isOn: segment) }
                .reduce(into: [CGPoint]()) { result, point in
                    if !result.contains(where: { TreeRoutingGeometry.pointsEqual($0, point) }) {
                        result.append(point)
                    }
                }.sorted {
                    segment.orientation == .horizontal ? $0.x < $1.x : $0.y < $1.y
                }
            guard points.count > 1 else { return [] }
            return zip(points, points.dropFirst()).compactMap { start, end in
                let candidate = TreeConnector.Segment(start: start, end: end)
                return candidate.orientation == nil ? nil : candidate
            }
        }
    }
}
