package tech.robihamanto.heritg.android.core.tree

import tech.robihamanto.heritg.android.core.domain.EnglishSemanticFormatter
import tech.robihamanto.heritg.android.core.domain.SemanticFormatter
import tech.robihamanto.heritg.android.core.model.RelationshipKind
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

data class TreeNonParentRoute(
    val edge: TreeEdgeLayout,
    val segments: List<Segment>,
    val labelPosition: Point?,
    val labelObstacle: TreeObstacle?,
) {
    val id: String get() = edge.id
}

object TreeObstacleRouter {
    internal const val CoordinatePadding = 2.0
    private const val BendPenalty = 24.0
    private const val Epsilon = 0.001

    fun nodeObstacles(layout: TreeLayoutResult, showsRelationshipLabels: Boolean): List<TreeObstacle> =
        layout.nodes.sortedBy { it.id }.flatMap { node ->
            val addSide = TreeVisualMetrics.addControlSide(
                occupiedSides(node, layout.edges),
                if (node.position.x <= 0) TreeNodeSide.LEFT else TreeNodeSide.RIGHT,
            )
            val addCenter = TreeVisualMetrics.addControlPosition(node.position, 1.0, addSide)
            val editCenter = TreeVisualMetrics.adjacentControlPosition(addCenter, 1.0, addSide)
            listOf(
                TreeObstacle(TreeObstacleKind.Avatar(node.id), TreeVisualMetrics.avatarRect(node.position)),
                TreeObstacle(
                    TreeObstacleKind.NodeLabel(node.id),
                    TreeVisualMetrics.nodeLabelRect(
                        node.position,
                        showsRelationshipLabels,
                        node.person.lifeSummary != null,
                    ),
                ),
                TreeObstacle(TreeObstacleKind.AddControl(node.id), TreeVisualMetrics.controlRect(addCenter)),
                TreeObstacle(TreeObstacleKind.EditControl(node.id), TreeVisualMetrics.controlRect(editCenter)),
            )
        }

    fun route(
        edge: TreeEdgeLayout,
        avoiding: List<TreeObstacle>,
        occupiedSegments: List<Segment> = emptyList(),
        semanticFormatter: SemanticFormatter = EnglishSemanticFormatter,
        textMeasurer: TreeTextMeasurer = PortableTreeTextMeasurer,
    ): TreeNonParentRoute {
        val obstacles = sorted(avoiding)
        val endpointIds = setOf(edge.fromPersonId, edge.toPersonId)
        var bestSegments: List<Segment>? = null
        var bestCost = Double.POSITIVE_INFINITY
        terminalPairs(edge).forEach { (penalty, terminals) ->
            val segments = TreeFastRoute.preferredRoute(
                terminals.first,
                terminals.second,
                obstacles,
                endpointIds,
                occupiedSegments,
            ) ?: return@forEach
            val cost = segments.sumOf { it.length } + max(segments.size - 1, 0) * BendPenalty + penalty
            if (cost < bestCost) {
                bestSegments = segments
                bestCost = cost
            }
        }
        val segments = bestSegments.orEmpty()
        val label = relationshipLabelPlacement(
            edge,
            segments,
            obstacles,
            occupiedSegments + segments,
            semanticFormatter,
            textMeasurer,
        )
        return TreeNonParentRoute(edge, segments, label?.first, label?.second)
    }

    fun route(
        segment: Segment,
        avoiding: List<TreeObstacle>,
        endpointPersonIds: Set<String>,
        occupiedSegments: List<Segment> = emptyList(),
    ): List<Segment> = TreeFastRoute.preferredRoute(
        segment.start,
        segment.end,
        sorted(avoiding),
        endpointPersonIds,
        occupiedSegments,
    ).orEmpty()

    fun routeIsClear(
        segments: List<Segment>,
        avoiding: List<TreeObstacle>,
        endpointPersonIds: Set<String> = emptySet(),
    ): Boolean = segments.isNotEmpty() && segments.all { segment ->
        avoiding.all { obstacle -> !hasForbiddenIntersection(segment, obstacle, endpointPersonIds) }
    }

    fun hasForbiddenIntersection(
        segment: Segment,
        obstacle: TreeObstacle,
        endpointPersonIds: Set<String>,
    ): Boolean {
        if (!segmentIntersects(segment, obstacle.rect, TreeVisualMetrics.ConnectorClearance)) return false
        if (!TreeFastRoute.permitsTerminalExit(segment, obstacle, endpointPersonIds)) return true
        return segmentIntersects(segment, obstacle.rect, 0.0)
    }

    fun permitsTerminalContact(point: Point, obstacle: TreeObstacle): Boolean = when (obstacle.kind) {
        is TreeObstacleKind.Avatar -> {
            val touchesVertical = (abs(point.x - obstacle.rect.minX) < Epsilon ||
                abs(point.x - obstacle.rect.maxX) < Epsilon) &&
                point.y >= obstacle.rect.minY - Epsilon && point.y <= obstacle.rect.maxY + Epsilon
            val touchesHorizontal = (abs(point.y - obstacle.rect.minY) < Epsilon ||
                abs(point.y - obstacle.rect.maxY) < Epsilon) &&
                point.x >= obstacle.rect.minX - Epsilon && point.x <= obstacle.rect.maxX + Epsilon
            touchesVertical || touchesHorizontal
        }
        is TreeObstacleKind.NodeLabel -> abs(point.y - obstacle.rect.maxY - 2) < Epsilon &&
            point.x >= obstacle.rect.minX - Epsilon && point.x <= obstacle.rect.maxX + Epsilon
        is TreeObstacleKind.AddControl,
        is TreeObstacleKind.EditControl,
        is TreeObstacleKind.RelationshipLabel,
        -> false
    }

    fun segmentIntersects(segment: Segment, rect: TreeRect, clearance: Double): Boolean {
        val expanded = rect.insetBy(-clearance, -clearance)
        return when (segment.orientation) {
            SegmentOrientation.HORIZONTAL -> {
                if (segment.start.y <= expanded.minY + Epsilon || segment.start.y >= expanded.maxY - Epsilon) false
                else max(min(segment.start.x, segment.end.x), expanded.minX) <
                    min(max(segment.start.x, segment.end.x), expanded.maxX) - Epsilon
            }
            SegmentOrientation.VERTICAL -> {
                if (segment.start.x <= expanded.minX + Epsilon || segment.start.x >= expanded.maxX - Epsilon) false
                else max(min(segment.start.y, segment.end.y), expanded.minY) <
                    min(max(segment.start.y, segment.end.y), expanded.maxY) - Epsilon
            }
            null -> false
        }
    }

    fun hasCollinearOverlap(route: List<Segment>, occupied: List<Segment>): Boolean =
        TreeFastRoute.hasCollinearOverlap(route, occupied)

    internal fun firstRouteCandidate(
        start: Point,
        end: Point,
        obstacles: List<TreeObstacle>,
        isAccepted: (List<Segment>) -> Boolean,
    ): List<Segment>? {
        if (start.x == end.x || start.y == end.y) {
            val candidate = segments(listOf(start, end))
            if (isAccepted(candidate)) return candidate
        }
        val minObstacleY = obstacles.minOfOrNull { it.rect.minY } ?: min(start.y, end.y)
        val maxObstacleY = obstacles.maxOfOrNull { it.rect.maxY } ?: max(start.y, end.y)
        val channelYs = unique(
            buildList {
                add(min(start.y, end.y) - TreeVisualMetrics.AvatarRadius - TreeVisualMetrics.ConnectorClearance)
                add(max(start.y, end.y) + TreeVisualMetrics.AvatarRadius + TreeVisualMetrics.ConnectorClearance)
                add(minObstacleY - TreeVisualMetrics.ConnectorClearance - CoordinatePadding)
                add(maxObstacleY + TreeVisualMetrics.ConnectorClearance + CoordinatePadding)
                obstacles.forEach {
                    add(it.rect.minY - TreeVisualMetrics.ConnectorClearance - CoordinatePadding)
                    add(it.rect.maxY + TreeVisualMetrics.ConnectorClearance + CoordinatePadding)
                }
            },
        ).sortedWith(distanceComparator((start.y + end.y) / 2))
        channelYs.forEach { channelY ->
            val startXs = escapeXCoordinates(start, channelY, obstacles)
            val endXs = escapeXCoordinates(end, channelY, obstacles)
            startXs.forEach { startX ->
                endXs.forEach { endX ->
                    val candidate = segments(
                        listOf(
                            start,
                            Point(startX, start.y),
                            Point(startX, channelY),
                            Point(endX, channelY),
                            Point(endX, end.y),
                            end,
                        ),
                    )
                    if (isAccepted(candidate)) return candidate
                }
            }
        }
        return null
    }

    internal fun segments(rawPoints: List<Point>): List<Segment> {
        val points = rawPoints.fold(mutableListOf<Point>()) { result, point ->
            if (result.lastOrNull() != point) result += point
            result
        }
        if (points.size <= 1) return emptyList()
        var index = 1
        while (index < points.lastIndex) {
            val previous = points[index - 1]
            val current = points[index]
            val next = points[index + 1]
            if ((previous.x == current.x && current.x == next.x) ||
                (previous.y == current.y && current.y == next.y)
            ) points.removeAt(index) else index++
        }
        return points.zipWithNext(::Segment).filter { it.orientation != null }
    }

    private fun terminalPairs(edge: TreeEdgeLayout): List<Pair<Double, Pair<Point, Point>>> {
        val left = if (edge.from.x <= edge.to.x) edge.from else edge.to
        val right = if (edge.from.x <= edge.to.x) edge.to else edge.from
        val radius = TreeVisualMetrics.AvatarRadius
        return listOf(
            0.0 to (Point(left.x + radius, left.y) to Point(right.x - radius, right.y)),
            80.0 to (Point(left.x, left.y - radius) to Point(right.x, right.y - radius)),
            120.0 to (Point(left.x - radius, left.y) to Point(right.x + radius, right.y)),
        )
    }

    private fun escapeXCoordinates(point: Point, toY: Double, obstacles: List<TreeObstacle>): List<Double> {
        val lowerY = min(point.y, toY)
        val upperY = max(point.y, toY)
        val blockers = obstacles.filter { obstacle ->
            point.x > obstacle.rect.minX - TreeVisualMetrics.ConnectorClearance &&
                point.x < obstacle.rect.maxX + TreeVisualMetrics.ConnectorClearance &&
                max(lowerY, obstacle.rect.minY) <= min(upperY, obstacle.rect.maxY)
        }
        val values = buildList {
            add(point.x)
            blockers.forEach {
                add(it.rect.minX - TreeVisualMetrics.ConnectorClearance - CoordinatePadding)
                add(it.rect.maxX + TreeVisualMetrics.ConnectorClearance + CoordinatePadding)
            }
        }
        val result = unique(values).sortedWith(distanceComparator(point.x)).take(9).toMutableList()
        listOfNotNull(
            obstacles.minOfOrNull { it.rect.minX }?.minus(TreeVisualMetrics.ConnectorClearance + CoordinatePadding),
            obstacles.maxOfOrNull { it.rect.maxX }?.plus(TreeVisualMetrics.ConnectorClearance + CoordinatePadding),
        ).forEach { value -> if (result.none { abs(it - value) < Epsilon }) result += value }
        return result
    }

    private fun relationshipLabelPlacement(
        edge: TreeEdgeLayout,
        segments: List<Segment>,
        obstacles: List<TreeObstacle>,
        occupiedSegments: List<Segment>,
        semanticFormatter: SemanticFormatter,
        textMeasurer: TreeTextMeasurer,
    ): Pair<Point, TreeObstacle>? {
        val label = edge.marriageLabel(semanticFormatter) ?: return null
        val horizontal = segments.filter { it.orientation == SegmentOrientation.HORIZONTAL }.sortedWith { first, second ->
            if (first.length != second.length) second.length.compareTo(first.length)
            else compareValuesBy(first, second, { it.start.y }, { it.start.x }, { it.end.x })
        }
        val fractions = (1..<20).map { it / 20.0 }.sortedWith(distanceComparator(0.5))
        horizontal.forEach { segment ->
            fractions.forEach { fraction ->
                val anchor = Point(segment.start.x + (segment.end.x - segment.start.x) * fraction, segment.start.y)
                listOf(-22.0, 22.0, -40.0, 40.0, -58.0, 58.0).forEach { offset ->
                    val position = Point(anchor.x, anchor.y + offset)
                    val obstacle = TreeObstacle(
                        TreeObstacleKind.RelationshipLabel(edge.id),
                        TreeVisualMetrics.relationshipLabelRect(label, position, textMeasurer),
                    )
                    val clearsObstacles = obstacles.all {
                        !it.rect.insetBy(-TreeVisualMetrics.ConnectorClearance, -TreeVisualMetrics.ConnectorClearance)
                            .intersects(obstacle.rect)
                    }
                    val clearsConnectors = occupiedSegments.all {
                        !segmentIntersects(it, obstacle.rect, TreeVisualMetrics.ConnectorClearance)
                    }
                    if (clearsObstacles && clearsConnectors) return position to obstacle
                }
            }
        }
        return null
    }

    private fun occupiedSides(node: TreeNodeLayout, edges: List<TreeEdgeLayout>): Set<TreeNodeSide> = buildSet {
        edges.forEach { edge ->
            val other = when (node.id) {
                edge.fromPersonId -> edge.to
                edge.toPersonId -> edge.from
                else -> return@forEach
            }
            when (edge.kind) {
                RelationshipKind.PARENT -> add(if (other.y < node.position.y) TreeNodeSide.TOP else TreeNodeSide.BOTTOM)
                RelationshipKind.PARTNER, RelationshipKind.SIBLING ->
                    add(if (other.x < node.position.x) TreeNodeSide.LEFT else TreeNodeSide.RIGHT)
            }
        }
    }

    private fun sorted(obstacles: List<TreeObstacle>) = obstacles.sortedWith(
        compareBy<TreeObstacle> { it.kind.stableId }
            .thenBy { it.rect.minY }
            .thenBy { it.rect.minX }
            .thenBy { it.rect.height }
            .thenBy { it.rect.width },
    )

    private fun unique(values: List<Double>) = values.fold(mutableListOf<Double>()) { result, value ->
        if (result.none { abs(it - value) < Epsilon }) result += value
        result
    }

    private fun distanceComparator(origin: Double) = Comparator<Double> { first, second ->
        val firstDistance = abs(first - origin)
        val secondDistance = abs(second - origin)
        if (firstDistance == secondDistance) first.compareTo(second) else firstDistance.compareTo(secondDistance)
    }
}
