package tech.robihamanto.heritg.android.core.tree

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

internal fun routeFamilySegments(families: MutableList<MutableFamily>, obstacles: List<TreeObstacle>) {
    val occupiedSegments = mutableListOf<Segment>()
    families.indices.forEach { index ->
        val family = families[index]
        val personIds = (family.parentIds + family.childIds).toSet()
        var didRoute = false
        obstacleFreeRoute(family.segments, obstacles, personIds, occupiedSegments)?.let { route ->
            family.segments = route
            didRoute = true
        }
        if (!didRoute && family.junctions.size == 2) {
            val originalTrunkX = family.junctions[0].x
            val parentJoinY = family.junctions[0].y
            val childRailY = family.junctions[1].y
            candidateTrunkXs(originalTrunkX, obstacles).filter { it != originalTrunkX }.firstNotNullOfOrNull { trunkX ->
                val parentXs = family.parentPorts.map { it.x } + trunkX
                val childXs = family.children.map { it.x } + trunkX
                val geometry = FamilyGeometry(
                    parentJoinY,
                    childRailY,
                    trunkX,
                    parentXs.min()..parentXs.max(),
                    childXs.min()..childXs.max(),
                )
                val segments = familySegments(
                    family.parentCenters,
                    family.parentLabelBottoms,
                    family.parentPorts,
                    family.children,
                    geometry,
                )
                obstacleFreeRoute(segments, obstacles, personIds, occupiedSegments)?.let {
                    Triple(trunkX, it, listOf(Point(trunkX, parentJoinY), Point(trunkX, childRailY)))
                }
            }?.let { (_, route, junctions) ->
                family.segments = route
                family.junctions = junctions
                didRoute = true
            }
        }
        if (!didRoute) {
            family.segments = emptyList()
            family.junctions = emptyList()
        }
        occupiedSegments += family.segments
    }
}

private fun obstacleFreeRoute(
    segments: List<Segment>,
    obstacles: List<TreeObstacle>,
    endpointPersonIds: Set<String>,
    occupiedSegments: List<Segment>,
): List<Segment>? {
    val routed = mutableListOf<Segment>()
    splitAtAttachmentPoints(segments).forEach { segment ->
        val route = TreeObstacleRouter.route(segment, obstacles, endpointPersonIds, occupiedSegments)
        if (route.isEmpty()) return null
        routed += route
    }
    return routed.takeIf {
        TreeObstacleRouter.routeIsClear(it, obstacles, endpointPersonIds) && connectedNetwork(it)
    }
}

private fun splitAtAttachmentPoints(segments: List<Segment>): List<Segment> {
    val endpoints = segments.flatMap { listOf(it.start, it.end) }
    return segments.flatMap { segment ->
        val points = endpoints.filter { pointLiesOn(it, segment) }.fold(mutableListOf<Point>()) { result, point ->
            if (result.none { abs(it.x - point.x) < 0.001 && abs(it.y - point.y) < 0.001 }) result += point
            result
        }.sortedBy { if (segment.orientation == SegmentOrientation.HORIZONTAL) it.x else it.y }
        points.zipWithNext(::Segment).filter { it.orientation != null }
    }
}

private fun pointLiesOn(point: Point, segment: Segment): Boolean = when (segment.orientation) {
    SegmentOrientation.HORIZONTAL -> abs(point.y - segment.start.y) < 0.001 &&
        point.x >= min(segment.start.x, segment.end.x) - 0.001 &&
        point.x <= max(segment.start.x, segment.end.x) + 0.001
    SegmentOrientation.VERTICAL -> abs(point.x - segment.start.x) < 0.001 &&
        point.y >= min(segment.start.y, segment.end.y) - 0.001 &&
        point.y <= max(segment.start.y, segment.end.y) + 0.001
    null -> false
}

private fun candidateTrunkXs(trunkX: Double, obstacles: List<TreeObstacle>): List<Double> {
    val clearance = TreeVisualMetrics.ConnectorClearance + 2
    val values = buildList {
        add(trunkX)
        obstacles.forEach {
            add(it.rect.minX - clearance)
            add(it.rect.maxX + clearance)
        }
    }.fold(mutableListOf<Double>()) { result, value ->
        if (result.none { abs(it - value) < 0.001 }) result += value
        result
    }
    return values.sortedWith { first, second ->
        val firstDistance = abs(first - trunkX)
        val secondDistance = abs(second - trunkX)
        if (firstDistance == secondDistance) first.compareTo(second) else firstDistance.compareTo(secondDistance)
    }
}

internal fun connectedNetwork(segments: List<Segment>): Boolean {
    if (segments.isEmpty()) return false
    val visited = mutableSetOf(0)
    val pending = mutableListOf(0)
    while (pending.isNotEmpty()) {
        val index = pending.removeAt(pending.lastIndex)
        segments.indices.filter { it !in visited }.forEach { candidate ->
            if (segmentsTouch(segments[index], segments[candidate])) {
                visited += candidate
                pending += candidate
            }
        }
    }
    return visited.size == segments.size
}

private fun segmentsTouch(first: Segment, second: Segment): Boolean = when {
    first.orientation == SegmentOrientation.HORIZONTAL && second.orientation == SegmentOrientation.HORIZONTAL ->
        abs(first.start.y - second.start.y) < 0.001 && rangesTouch(
            min(first.start.x, first.end.x)..max(first.start.x, first.end.x),
            min(second.start.x, second.end.x)..max(second.start.x, second.end.x),
        )
    first.orientation == SegmentOrientation.VERTICAL && second.orientation == SegmentOrientation.VERTICAL ->
        abs(first.start.x - second.start.x) < 0.001 && rangesTouch(
            min(first.start.y, first.end.y)..max(first.start.y, first.end.y),
            min(second.start.y, second.end.y)..max(second.start.y, second.end.y),
        )
    first.orientation == SegmentOrientation.HORIZONTAL && second.orientation == SegmentOrientation.VERTICAL ->
        second.start.x >= min(first.start.x, first.end.x) - 0.001 &&
            second.start.x <= max(first.start.x, first.end.x) + 0.001 &&
            first.start.y >= min(second.start.y, second.end.y) - 0.001 &&
            first.start.y <= max(second.start.y, second.end.y) + 0.001
    first.orientation == SegmentOrientation.VERTICAL && second.orientation == SegmentOrientation.HORIZONTAL ->
        segmentsTouch(second, first)
    else -> false
}

private fun rangesTouch(first: ClosedFloatingPointRange<Double>, second: ClosedFloatingPointRange<Double>): Boolean =
    max(first.start, second.start) <= min(first.endInclusive, second.endInclusive) + 0.001
