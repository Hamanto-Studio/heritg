package tech.robihamanto.heritg.android.core.tree

import tech.robihamanto.heritg.android.core.domain.EnglishSemanticFormatter
import tech.robihamanto.heritg.android.core.domain.SemanticFormatter
import tech.robihamanto.heritg.android.core.model.RelationshipKind
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

data class TreeBand(val parentY: Int, val childY: Int) : Comparable<TreeBand> {
    override fun compareTo(other: TreeBand): Int =
        parentY.compareTo(other.parentY).takeIf { it != 0 } ?: childY.compareTo(other.childY)
}

data class FamilyConnection(
    val id: String,
    val parentIds: List<String>,
    val childIds: List<String>,
    val parentCenters: List<Point>,
    val parentPorts: List<Point>,
    val parentLabelBottoms: List<Double>,
    val children: List<Point>,
    val interval: ClosedFloatingPointRange<Double>,
    val band: TreeBand,
    val branchOffset: Double,
    val laneIndex: Int,
    val laneCount: Int,
    val segments: List<Segment>,
    val junctions: List<Point>,
)

data class TreeConnectorObstacleCollision(
    val connectorId: String,
    val segment: Segment,
    val obstacle: TreeObstacle,
)

data class TreeConnectionPlan(
    val families: List<FamilyConnection>,
    val nonParentRoutes: List<TreeNonParentRoute>,
    val obstacles: List<TreeObstacle>,
    val crossings: List<Point>,
    val showsRelationshipLabels: Boolean,
) {
    val nonParentEdges: List<TreeEdgeLayout> get() = nonParentRoutes.map { it.edge }

    val obstacleCollisions: List<TreeConnectorObstacleCollision>
        get() = buildList {
            families.forEach { family ->
                appendCollisions(
                    family.segments,
                    "family:${family.id}",
                    (family.parentIds + family.childIds).toSet(),
                )
            }
            nonParentRoutes.forEach { route ->
                appendCollisions(
                    route.segments,
                    "relationship:${route.id}",
                    setOf(route.edge.fromPersonId, route.edge.toPersonId),
                )
            }
        }

    val isObstacleFree: Boolean get() = obstacleCollisions.isEmpty()

    val connectorBounds: DrawingBounds
        get() = BoundsAccumulator().apply {
            families.flatMap { it.segments }.forEach(::include)
            nonParentRoutes.flatMap { it.segments }.forEach(::include)
        }.bounds() ?: DrawingBounds(0.0, 0.0, 0.0, 0.0)

    val routingFailures: List<String>
        get() = families.mapNotNull {
            if (it.segments.isEmpty() || !segmentsFormConnectedNetwork(it.segments)) "family:${it.id}" else null
        } + nonParentRoutes.mapNotNull {
            if (it.segments.isEmpty() || !segmentsFormConnectedNetwork(it.segments)) "relationship:${it.id}" else null
        }

    val hasRoutingFailures: Boolean
        get() = families.any { it.segments.isEmpty() } || nonParentRoutes.any { it.segments.isEmpty() }

    val hasCollinearConnectorOverlaps: Boolean
        get() {
            val connectors = families.map { it.segments } + nonParentRoutes.map { it.segments }
            connectors.indices.forEach { first ->
                ((first + 1)..<connectors.size).forEach { second ->
                    if (TreeObstacleRouter.hasCollinearOverlap(connectors[first], connectors[second])) return true
                }
            }
            return false
        }

    val isValid: Boolean get() = isObstacleFree && routingFailures.isEmpty() && !hasCollinearConnectorOverlaps

    fun drawingBounds(nodes: List<TreeNodeLayout>): DrawingBounds {
        val bounds = BoundsAccumulator()
        families.flatMap { it.segments }.forEach(bounds::include)
        nonParentRoutes.flatMap { it.segments }.forEach(bounds::include)
        nodes.forEach { node ->
            val bottom = TreeVisualMetrics.nodeLabelBottomOffset(
                showsRelationshipLabels,
                node.person.lifeSummary != null,
            )
            bounds.include(
                TreeRect(
                    node.position.x - TreeVisualMetrics.NodeLabelWidth / 2,
                    node.position.y - TreeVisualMetrics.AvatarRadius,
                    TreeVisualMetrics.NodeLabelWidth,
                    TreeVisualMetrics.AvatarRadius + bottom,
                ),
            )
        }
        obstacles.forEach { bounds.include(it.rect) }
        val raw = bounds.bounds() ?: DrawingBounds(-100.0, -100.0, 200.0, 200.0)
        return DrawingBounds(raw.minX - 100, raw.minY - 100, raw.width + 200, raw.height + 200)
    }

    private fun MutableList<TreeConnectorObstacleCollision>.appendCollisions(
        segments: List<Segment>,
        connectorId: String,
        endpointPersonIds: Set<String>,
    ) {
        segments.forEach { segment ->
            obstacles.forEach { obstacle ->
                if (TreeObstacleRouter.hasForbiddenIntersection(segment, obstacle, endpointPersonIds)) {
                    add(TreeConnectorObstacleCollision(connectorId, segment, obstacle))
                }
            }
        }
    }

    companion object {
        fun make(
            layout: TreeLayoutResult,
            showsRelationshipLabels: Boolean = true,
            semanticFormatter: SemanticFormatter = EnglishSemanticFormatter,
            textMeasurer: TreeTextMeasurer = PortableTreeTextMeasurer,
        ): TreeConnectionPlan {
            val positions = layout.nodes.associate { it.id to it.position }
            val nodesById = layout.nodes.associateBy { it.id }
            val nodeObstacles = TreeObstacleRouter.nodeObstacles(layout, showsRelationshipLabels)
            val childrenByParentSet = mutableMapOf<List<String>, MutableSet<String>>()
            layout.edges.filter { it.kind == RelationshipKind.PARENT }.groupBy { it.toPersonId }
                .forEach { (childId, edges) ->
                    val parentIds = edges.map { it.fromPersonId }.distinct().sorted()
                    if (parentIds.isNotEmpty() && childId in positions) {
                        childrenByParentSet.getOrPut(parentIds, ::mutableSetOf).add(childId)
                    }
                }
            val mutableFamilies = childrenByParentSet.mapNotNull { (parentIds, childIds) ->
                val parents = parentIds.mapNotNull { id -> positions[id]?.let { id to it } }
                    .sortedWith(compareBy<Pair<String, Point>> { it.second.x }.thenBy { it.first })
                val children = childIds.mapNotNull { id -> positions[id]?.let { id to it } }
                    .sortedWith(compareBy<Pair<String, Point>> { it.second.x }.thenBy { it.first })
                if (parents.isEmpty() || children.isEmpty()) return@mapNotNull null
                val allPoints = parents.map { it.second } + children.map { it.second }
                val sortedParentIds = parents.map { it.first }
                MutableFamily(
                    id = stableId(sortedParentIds),
                    parentIds = sortedParentIds,
                    childIds = children.map { it.first },
                    parentCenters = parents.map { it.second },
                    parentPorts = parents.mapTo(mutableListOf()) { it.second },
                    parentLabelBottoms = sortedParentIds.map { id ->
                        TreeVisualMetrics.nodeLabelBottomOffset(
                            showsRelationshipLabels,
                            nodesById[id]?.person?.lifeSummary != null,
                        ) + 2
                    },
                    children = children.map { it.second },
                    interval = allPoints.minOf { it.x }..allPoints.maxOf { it.x },
                    band = TreeBand(
                        parents.map { it.second.y }.average().roundToInt(),
                        children.map { it.second.y }.average().roundToInt(),
                    ),
                )
            }.toMutableList()
            assignLanes(mutableFamilies)
            assignPorts(mutableFamilies)
            mutableFamilies.indices.forEach { index ->
                planFamily(index, mutableFamilies, nodeObstacles, nodesById)
            }
            mutableFamilies.sortBy { it.id }
            separateCollinearVerticalSegments(mutableFamilies)
            routeFamilySegments(mutableFamilies, nodeObstacles)

            val routingObstacles = nodeObstacles.toMutableList()
            val occupiedSegments = mutableFamilies.flatMapTo(mutableListOf()) { it.segments }
            val routes = layout.edges.filter { it.kind != RelationshipKind.PARENT }.sortedBy { it.id }.map { edge ->
                TreeObstacleRouter.route(
                    edge, routingObstacles, occupiedSegments, semanticFormatter, textMeasurer,
                ).also { route ->
                    occupiedSegments += route.segments
                    route.labelObstacle?.let(routingObstacles::add)
                }
            }
            val families = mutableFamilies.map(MutableFamily::freeze)
            return TreeConnectionPlan(
                families,
                routes,
                routingObstacles,
                crossingPoints(families, routes),
                showsRelationshipLabels,
            )
        }

        fun segmentsFormConnectedNetwork(segments: List<Segment>): Boolean = connectedNetwork(segments)

        private fun assignLanes(families: MutableList<MutableFamily>) {
            families.groupBy { it.band }.toSortedMap().values.forEach { bandFamilies ->
                val ordered = bandFamilies.sortedWith(
                    compareBy<MutableFamily> { it.interval.start }.thenBy { it.interval.endInclusive }.thenBy { it.id },
                )
                val laneEnds = mutableListOf<Double>()
                val lanes = ordered.map { family ->
                    val lane = laneEnds.indexOfFirst { it + 20 < family.interval.start }
                    if (lane >= 0) {
                        laneEnds[lane] = family.interval.endInclusive
                        lane
                    } else {
                        laneEnds += family.interval.endInclusive
                        laneEnds.lastIndex
                    }
                }
                ordered.forEachIndexed { index, family ->
                    family.laneIndex = lanes[index]
                    family.laneCount = (lanes.maxOrNull() ?: 0) + 1
                }
            }
        }

        private fun assignPorts(families: MutableList<MutableFamily>) {
            families.flatMapIndexed { index, family -> family.parentIds.map { it to index } }
                .groupBy({ it.first }, { it.second }).filterValues { it.size > 1 }
                .forEach { (parentId, indices) ->
                    val sorted = indices.sortedBy { families[it].id }
                    sorted.forEachIndexed { portIndex, familyIndex ->
                        val family = families[familyIndex]
                        val pointIndex = family.parentIds.indexOf(parentId)
                        val centeredPort = portIndex - (sorted.size - 1) / 2.0
                        family.parentPorts[pointIndex] = family.parentPorts[pointIndex].copy(
                            x = family.parentPorts[pointIndex].x + centeredPort * 12,
                        )
                    }
                }
        }

        private fun planFamily(
            index: Int,
            families: List<MutableFamily>,
            obstacles: List<TreeObstacle>,
            nodesById: Map<String, TreeNodeLayout>,
        ) {
            val family = families[index]
            var parentStartY = family.parentCenters.zip(family.parentLabelBottoms).maxOf { it.first.y + it.second }
            val parentY = family.parentCenters.map { it.y }.average()
            obstacles.forEach { obstacle ->
                val kind = obstacle.kind as? TreeObstacleKind.NodeLabel ?: return@forEach
                val node = nodesById[kind.personId] ?: return@forEach
                if (kind.personId !in family.parentIds && abs(node.position.y - parentY) < 0.5 &&
                    obstacle.rect.maxX >= family.interval.start && obstacle.rect.minX <= family.interval.endInclusive
                ) parentStartY = max(parentStartY, obstacle.rect.maxY + TreeVisualMetrics.ConnectorClearance)
            }
            val childTopY = family.children.minOf { it.y - TreeVisualMetrics.AvatarRadius }
            val availableHeight = max(childTopY - parentStartY - 32, 0.0)
            val trackSpacing = if (family.laneCount > 1) {
                max(2.0, min(12.0, availableHeight / ((family.laneCount - 1) * 2)))
            } else 0.0
            val parentJoinY = parentStartY + 8 + family.laneIndex * trackSpacing
            val childRailY = childTopY - 8 - (family.laneCount - 1 - family.laneIndex) * trackSpacing
            val centeredLane = family.laneIndex - (family.laneCount - 1) / 2.0
            val baseTrunkX = family.parentPorts.map { it.x }.average()
            val nearestChildX = family.children.map { it.x }.minWithOrNull(
                compareBy<Double> { abs(it - baseTrunkX) }.thenBy { it },
            ) ?: baseTrunkX
            val overlapsUnrelatedEndpoint = families.indices.any { otherIndex ->
                otherIndex != index && families[otherIndex].band == family.band &&
                    (families[otherIndex].parentPorts + families[otherIndex].children).any { it.x == nearestChildX }
            }
            val alignsWithChild = !overlapsUnrelatedEndpoint &&
                (family.children.size == 1 || abs(nearestChildX - baseTrunkX) <= TreeVisualMetrics.ConnectorClearance + 4)
            val trunkX = if (alignsWithChild) nearestChildX else baseTrunkX + centeredLane * 8
            val geometry = FamilyGeometry(
                parentJoinY,
                childRailY,
                trunkX,
                min(family.parentPorts.minOf { it.x }, trunkX)..max(family.parentPorts.maxOf { it.x }, trunkX),
                min(family.children.minOf { it.x }, trunkX)..max(family.children.maxOf { it.x }, trunkX),
            )
            family.branchOffset = childRailY - (parentStartY + childTopY) / 2
            family.segments = familySegments(
                family.parentCenters,
                family.parentLabelBottoms,
                family.parentPorts,
                family.children,
                geometry,
            )
            family.junctions = listOf(Point(trunkX, parentJoinY), Point(trunkX, childRailY))
        }

        private fun separateCollinearVerticalSegments(families: MutableList<MutableFamily>) {
            val occupied = mutableListOf<Segment>()
            families.forEach { family ->
                family.segments = family.segments.flatMap { segment ->
                    if (segment.orientation != SegmentOrientation.VERTICAL) return@flatMap listOf(segment)
                    val offsets = listOf(0.0) + (1..20).flatMap { listOf(it * 6.0, it * -6.0) }
                    val routed = offsets.asSequence().map { offset ->
                        Segment(segment.start.copy(x = segment.start.x + offset), segment.end.copy(x = segment.end.x + offset))
                    }.firstOrNull { candidate -> occupied.none { collinearlyOverlaps(candidate, it) } } ?: segment
                    occupied += routed
                    if (routed.start.x == segment.start.x) listOf(segment) else listOf(
                        Segment(segment.start, routed.start),
                        routed,
                        Segment(routed.end, segment.end),
                    )
                }
            }
        }

        private fun collinearlyOverlaps(first: Segment, second: Segment): Boolean =
            first.orientation == SegmentOrientation.VERTICAL && second.orientation == SegmentOrientation.VERTICAL &&
                first.start.x == second.start.x &&
                max(min(first.start.y, first.end.y), min(second.start.y, second.end.y)) <
                min(max(first.start.y, first.end.y), max(second.start.y, second.end.y))

        private fun crossingPoints(families: List<FamilyConnection>, routes: List<TreeNonParentRoute>): List<Point> {
            val connectors = families.map { PlannedConnector(it.segments, null) } +
                routes.indices.map { PlannedConnector(routes[it].segments, it) }
            val points = mutableSetOf<Point>()
            connectors.indices.forEach { firstIndex ->
                ((firstIndex + 1)..<connectors.size).forEach { secondIndex ->
                    val first = connectors[firstIndex]
                    val second = connectors[secondIndex]
                    first.segments.forEach { a -> second.segments.forEach { b ->
                        val point = crossingPoint(a, b) ?: return@forEach
                        if (!isSharedRouteTerminal(point, first, second, routes)) points += point
                    } }
                }
            }
            return points.sortedWith(compareBy<Point> { it.y }.thenBy { it.x })
        }

        private fun isSharedRouteTerminal(
            point: Point,
            first: PlannedConnector,
            second: PlannedConnector,
            routes: List<TreeNonParentRoute>,
        ): Boolean {
            val firstIndex = first.routeIndex ?: return false
            val secondIndex = second.routeIndex ?: return false
            val firstIds = setOf(routes[firstIndex].edge.fromPersonId, routes[firstIndex].edge.toPersonId)
            val secondIds = setOf(routes[secondIndex].edge.fromPersonId, routes[secondIndex].edge.toPersonId)
            if (firstIds.intersect(secondIds).isEmpty()) return false
            val firstTerminals = listOfNotNull(first.segments.firstOrNull()?.start, first.segments.lastOrNull()?.end)
            val secondTerminals = listOfNotNull(second.segments.firstOrNull()?.start, second.segments.lastOrNull()?.end)
            return point in firstTerminals && point in secondTerminals
        }

        private fun crossingPoint(first: Segment, second: Segment): Point? {
            val horizontal: Segment
            val vertical: Segment
            if (first.orientation == SegmentOrientation.HORIZONTAL && second.orientation == SegmentOrientation.VERTICAL) {
                horizontal = first
                vertical = second
            } else if (first.orientation == SegmentOrientation.VERTICAL && second.orientation == SegmentOrientation.HORIZONTAL) {
                horizontal = second
                vertical = first
            } else return null
            return Point(vertical.start.x, horizontal.start.y).takeIf {
                it.x in min(horizontal.start.x, horizontal.end.x)..max(horizontal.start.x, horizontal.end.x) &&
                    it.y in min(vertical.start.y, vertical.end.y)..max(vertical.start.y, vertical.end.y)
            }
        }

        private fun stableId(ids: List<String>) = ids.joinToString("|") { "${it.length}:$it" }
    }
}

internal data class MutableFamily(
    val id: String,
    val parentIds: List<String>,
    val childIds: List<String>,
    val parentCenters: List<Point>,
    val parentPorts: MutableList<Point>,
    val parentLabelBottoms: List<Double>,
    val children: List<Point>,
    val interval: ClosedFloatingPointRange<Double>,
    val band: TreeBand,
    var branchOffset: Double = 0.0,
    var laneIndex: Int = 0,
    var laneCount: Int = 1,
    var segments: List<Segment> = emptyList(),
    var junctions: List<Point> = emptyList(),
) {
    fun freeze() = FamilyConnection(
        id,
        parentIds,
        childIds,
        parentCenters,
        parentPorts.toList(),
        parentLabelBottoms,
        children,
        interval,
        band,
        branchOffset,
        laneIndex,
        laneCount,
        segments,
        junctions,
    )
}

private data class PlannedConnector(val segments: List<Segment>, val routeIndex: Int?)

private class BoundsAccumulator {
    private var minX = Double.POSITIVE_INFINITY
    private var minY = Double.POSITIVE_INFINITY
    private var maxX = Double.NEGATIVE_INFINITY
    private var maxY = Double.NEGATIVE_INFINITY

    fun include(segment: Segment) {
        include(segment.start)
        include(segment.end)
    }

    fun include(rect: TreeRect) {
        include(Point(rect.minX, rect.minY))
        include(Point(rect.maxX, rect.maxY))
    }

    private fun include(point: Point) {
        minX = min(minX, point.x)
        minY = min(minY, point.y)
        maxX = max(maxX, point.x)
        maxY = max(maxY, point.y)
    }

    fun bounds(): DrawingBounds? = if (minX.isInfinite()) null else DrawingBounds(minX, minY, maxX - minX, maxY - minY)
}
