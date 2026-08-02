package tech.robihamanto.heritg.android.core.tree

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

internal object TreeFastRoute {
    private const val Epsilon = 0.001

    fun preferredRoute(
        start: Point,
        end: Point,
        obstacles: List<TreeObstacle>,
        endpointPersonIds: Set<String>,
        occupiedSegments: List<Segment>,
    ): List<Segment>? {
        if (endpointIsBlocked(start, obstacles, endpointPersonIds) ||
            endpointIsBlocked(end, obstacles, endpointPersonIds)
        ) return null
        val direct = TreeObstacleRouter.segments(listOf(start, end))
        if (TreeObstacleRouter.routeIsClear(direct, obstacles, endpointPersonIds) &&
            !hasCollinearOverlap(direct, occupiedSegments)
        ) return direct
        bestClearRoute(fastRouteCandidates(start, end, obstacles), obstacles, endpointPersonIds, occupiedSegments)
            ?.let { return it }
        return TreeObstacleRouter.firstRouteCandidate(start, end, obstacles) {
            TreeObstacleRouter.routeIsClear(it, obstacles, endpointPersonIds) &&
                !hasCollinearOverlap(it, occupiedSegments)
        }
    }

    fun hasCollinearOverlap(route: List<Segment>, occupied: List<Segment>): Boolean = route.any { candidate ->
        occupied.any { segment ->
            when {
                candidate.orientation == SegmentOrientation.HORIZONTAL &&
                    segment.orientation == SegmentOrientation.HORIZONTAL &&
                    abs(candidate.start.y - segment.start.y) < Epsilon ->
                    max(min(candidate.start.x, candidate.end.x), min(segment.start.x, segment.end.x)) <
                        min(max(candidate.start.x, candidate.end.x), max(segment.start.x, segment.end.x)) - Epsilon
                candidate.orientation == SegmentOrientation.VERTICAL &&
                    segment.orientation == SegmentOrientation.VERTICAL &&
                    abs(candidate.start.x - segment.start.x) < Epsilon ->
                    max(min(candidate.start.y, candidate.end.y), min(segment.start.y, segment.end.y)) <
                        min(max(candidate.start.y, candidate.end.y), max(segment.start.y, segment.end.y)) - Epsilon
                else -> false
            }
        }
    }

    fun permitsTerminalExit(segment: Segment, obstacle: TreeObstacle, endpointPersonIds: Set<String>): Boolean {
        val personId = when (val kind = obstacle.kind) {
            is TreeObstacleKind.Avatar -> kind.personId
            is TreeObstacleKind.NodeLabel -> kind.personId
            is TreeObstacleKind.AddControl,
            is TreeObstacleKind.EditControl,
            is TreeObstacleKind.RelationshipLabel,
            -> return false
        }
        if (personId !in endpointPersonIds) return false
        return listOf(segment.start to segment.end, segment.end to segment.start).any { (point, other) ->
            if (!TreeObstacleRouter.permitsTerminalContact(point, obstacle)) return@any false
            when {
                obstacle.kind is TreeObstacleKind.Avatar && segment.orientation == SegmentOrientation.HORIZONTAL -> when {
                    abs(point.x - obstacle.rect.minX) < Epsilon -> other.x < point.x
                    abs(point.x - obstacle.rect.maxX) < Epsilon -> other.x > point.x
                    else -> false
                }
                obstacle.kind is TreeObstacleKind.Avatar && segment.orientation == SegmentOrientation.VERTICAL -> when {
                    abs(point.y - obstacle.rect.minY) < Epsilon -> other.y < point.y
                    abs(point.y - obstacle.rect.maxY) < Epsilon -> other.y > point.y
                    else -> false
                }
                obstacle.kind is TreeObstacleKind.NodeLabel && segment.orientation == SegmentOrientation.VERTICAL ->
                    other.y > point.y
                else -> false
            }
        }
    }

    private fun fastRouteCandidates(start: Point, end: Point, obstacles: List<TreeObstacle>): List<List<Segment>> {
        val clearance = TreeVisualMetrics.ConnectorClearance + TreeObstacleRouter.CoordinatePadding
        val coordinates: List<Double>
        val points: (Double) -> List<Point>
        if (start.y == end.y) {
            coordinates = obstacles.flatMap { listOf(it.rect.minY - clearance, it.rect.maxY + clearance) }
                .sortedWith(distanceComparator(start.y))
            points = { y -> listOf(start, Point(start.x, y), Point(end.x, y), end) }
        } else if (start.x == end.x) {
            coordinates = obstacles.flatMap { listOf(it.rect.minX - clearance, it.rect.maxX + clearance) }
                .sortedWith(distanceComparator(start.x))
            points = { x -> listOf(start, Point(x, start.y), Point(x, end.y), end) }
        } else return emptyList()
        val seen = mutableListOf<Double>()
        return coordinates.mapNotNull { coordinate ->
            if (seen.any { abs(it - coordinate) < Epsilon }) null else {
                seen += coordinate
                TreeObstacleRouter.segments(points(coordinate))
            }
        }
    }

    private fun endpointIsBlocked(
        point: Point,
        obstacles: List<TreeObstacle>,
        endpointPersonIds: Set<String>,
    ): Boolean = obstacles.any { obstacle ->
        val rect = obstacle.rect.insetBy(-TreeVisualMetrics.ConnectorClearance, -TreeVisualMetrics.ConnectorClearance)
        val inside = point.x > rect.minX + Epsilon && point.x < rect.maxX - Epsilon &&
            point.y > rect.minY + Epsilon && point.y < rect.maxY - Epsilon
        if (!inside) return@any false
        val personId = when (val kind = obstacle.kind) {
            is TreeObstacleKind.Avatar -> kind.personId
            is TreeObstacleKind.NodeLabel -> kind.personId
            is TreeObstacleKind.AddControl,
            is TreeObstacleKind.EditControl,
            is TreeObstacleKind.RelationshipLabel,
            -> null
        }
        personId !in endpointPersonIds || !TreeObstacleRouter.permitsTerminalContact(point, obstacle)
    }

    private fun bestClearRoute(
        candidates: List<List<Segment>>,
        obstacles: List<TreeObstacle>,
        endpointPersonIds: Set<String>,
        occupiedSegments: List<Segment>,
    ) = candidates.firstOrNull {
        TreeObstacleRouter.routeIsClear(it, obstacles, endpointPersonIds) &&
            !hasCollinearOverlap(it, occupiedSegments)
    }

    private fun distanceComparator(origin: Double) = Comparator<Double> { first, second ->
        val firstDistance = abs(first - origin)
        val secondDistance = abs(second - origin)
        if (firstDistance == secondDistance) first.compareTo(second) else firstDistance.compareTo(secondDistance)
    }
}
