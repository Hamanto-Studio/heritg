package tech.robihamanto.heritg.android.core.tree

import tech.robihamanto.heritg.android.core.model.RelationshipKind
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

enum class SegmentOrientation { HORIZONTAL, VERTICAL }

data class Segment(val start: Point, val end: Point) {
    val orientation: SegmentOrientation?
        get() = when {
            start.y == end.y && start.x != end.x -> SegmentOrientation.HORIZONTAL
            start.x == end.x && start.y != end.y -> SegmentOrientation.VERTICAL
            else -> null
        }
}

data class FamilyConnection(
    val id: String,
    val parentIds: List<String>,
    val childIds: List<String>,
    val parentCenters: List<Point>,
    val parentPorts: List<Point>,
    val children: List<Point>,
    val laneIndex: Int,
    val laneCount: Int,
    val branchOffset: Double,
    val segments: List<Segment>,
    val junctions: List<Point>,
)

data class DrawingBounds(val minX: Double, val minY: Double, val width: Double, val height: Double) {
    val maxX: Double get() = minX + width
    val maxY: Double get() = minY + height
}

data class TreeConnectionPlan(
    val families: List<FamilyConnection>,
    val nonParentEdges: List<TreeEdgeLayout>,
    val crossings: List<Point>,
    val showsRelationshipLabels: Boolean,
) {
    fun drawingBounds(nodes: List<TreeNodeLayout>): DrawingBounds {
        val xValues = mutableListOf<Double>()
        val yValues = mutableListOf<Double>()
        families.flatMap { it.segments }.forEach {
            xValues += listOf(it.start.x, it.end.x)
            yValues += listOf(it.start.y, it.end.y)
        }
        nonParentEdges.forEach {
            xValues += listOf(it.from.x, it.to.x)
            yValues += listOf(it.from.y, it.to.y)
        }
        nodes.forEach { node ->
            xValues += listOf(
                node.position.x - TreeVisualMetrics.NodeLabelWidth / 2,
                node.position.x + TreeVisualMetrics.NodeLabelWidth / 2,
            )
            yValues += listOf(
                node.position.y - TreeVisualMetrics.AvatarRadius,
                node.position.y + TreeVisualMetrics.nodeLabelBottomOffset(
                    showsRelationshipLabels,
                    node.person.lifeSummary != null,
                ),
            )
        }
        if (xValues.isEmpty()) return DrawingBounds(-100.0, -100.0, 200.0, 200.0)
        val minX = xValues.min() - 100
        val maxX = xValues.max() + 100
        val minY = yValues.min() - 100
        val maxY = yValues.max() + 100
        return DrawingBounds(minX, minY, maxX - minX, maxY - minY)
    }

    companion object {
        fun make(layout: TreeLayoutResult, showsRelationshipLabels: Boolean = true): TreeConnectionPlan {
            val positions = layout.nodes.associate { it.id to it.position }
            val nodes = layout.nodes.associateBy { it.id }
            val childrenByParents = layout.edges.filter { it.kind == RelationshipKind.PARENT }
                .groupBy { it.toPersonId }
                .mapNotNull { (child, edges) ->
                    val parents = edges.map { it.fromPersonId }.distinct().sorted()
                    if (parents.isEmpty() || child !in positions) null else parents to child
                }.groupBy({ it.first }, { it.second })
            val mutable = childrenByParents.mapNotNull { (parentIds, childIds) ->
                val parents = parentIds.mapNotNull { id -> positions[id]?.let { id to it } }
                    .sortedWith(compareBy<Pair<String, Point>> { it.second.x }.thenBy { it.first })
                val children = childIds.distinct().mapNotNull { id -> positions[id]?.let { id to it } }
                    .sortedWith(compareBy<Pair<String, Point>> { it.second.x }.thenBy { it.first })
                if (parents.isEmpty() || children.isEmpty()) null else MutableFamily(
                    id = stableId(parents.map { it.first }),
                    parentIds = parents.map { it.first },
                    childIds = children.map { it.first },
                    parentCenters = parents.map { it.second },
                    parentPorts = parents.map { it.second }.toMutableList(),
                    parentLabelBottoms = parents.map {
                        TreeVisualMetrics.nodeLabelBottomOffset(
                            showsRelationshipLabels,
                            nodes[it.first]?.person?.lifeSummary != null,
                        ) + 2
                    },
                    children = children.map { it.second },
                )
            }.toMutableList()
            assignLanes(mutable)
            assignPorts(mutable)
            mutable.forEach { it.route() }
            mutable.sortBy { it.id }
            separateVerticalChannels(mutable)
            val families = mutable.map { it.freeze() }
            return TreeConnectionPlan(
                families,
                layout.edges.filter { it.kind != RelationshipKind.PARENT }.sortedBy { it.id },
                crossingPoints(families),
                showsRelationshipLabels,
            )
        }

        private fun assignLanes(families: MutableList<MutableFamily>) {
            families.groupBy { it.band }.toSortedMap(compareBy<Pair<Int, Int>> { it.first }.thenBy { it.second })
                .values.forEach { bandFamilies ->
                    val ordered = bandFamilies.sortedWith(
                        compareBy<MutableFamily> { it.minX }.thenBy { it.maxX }.thenBy { it.id },
                    )
                    val lanes = laneIndices(ordered.map { it.minX..it.maxX }, 20.0)
                    val count = (lanes.maxOrNull() ?: 0) + 1
                    ordered.forEachIndexed { index, family ->
                        family.laneIndex = lanes[index]
                        family.laneCount = count
                    }
                }
        }

        private fun assignPorts(families: MutableList<MutableFamily>) {
            val byParent = families.flatMapIndexed { index, family -> family.parentIds.map { it to index } }
                .groupBy({ it.first }, { it.second })
            byParent.filterValues { it.size > 1 }.forEach { (parentId, familyIndices) ->
                familyIndices.sortedBy { families[it].id }.forEachIndexed { portIndex, familyIndex ->
                    val family = families[familyIndex]
                    val pointIndex = family.parentIds.indexOf(parentId)
                    val centered = portIndex - (familyIndices.size - 1) / 2.0
                    family.parentPorts[pointIndex] = family.parentPorts[pointIndex].copy(
                        x = family.parentPorts[pointIndex].x + centered * 12,
                    )
                }
            }
        }

        private fun laneIndices(intervals: List<ClosedFloatingPointRange<Double>>, clearance: Double): List<Int> {
            val ends = mutableListOf<Double>()
            return intervals.map { interval ->
                val lane = ends.indexOfFirst { it + clearance < interval.start }
                if (lane >= 0) {
                    ends[lane] = interval.endInclusive
                    lane
                } else {
                    ends += interval.endInclusive
                    ends.lastIndex
                }
            }
        }

        private fun separateVerticalChannels(families: MutableList<MutableFamily>) {
            val occupied = mutableListOf<Segment>()
            families.forEach { family ->
                family.segments = family.segments.flatMap { segment ->
                    if (segment.orientation != SegmentOrientation.VERTICAL) return@flatMap listOf(segment)
                    val offsets = listOf(0.0) + (1..20).flatMap { listOf(it * 6.0, it * -6.0) }
                    val routed = offsets.asSequence().map { offset ->
                        Segment(
                            segment.start.copy(x = segment.start.x + offset),
                            segment.end.copy(x = segment.end.x + offset),
                        )
                    }.firstOrNull { candidate -> occupied.none { overlaps(candidate, it) } } ?: segment
                    occupied += routed
                    if (routed.start.x == segment.start.x) listOf(segment) else listOf(
                        Segment(segment.start, routed.start), routed, Segment(routed.end, segment.end),
                    ).filter { it.orientation != null }
                }
            }
        }

        private fun overlaps(first: Segment, second: Segment): Boolean =
            first.orientation == SegmentOrientation.VERTICAL && second.orientation == SegmentOrientation.VERTICAL &&
                first.start.x == second.start.x &&
                max(min(first.start.y, first.end.y), min(second.start.y, second.end.y)) <
                min(max(first.start.y, first.end.y), max(second.start.y, second.end.y))

        private fun crossingPoints(families: List<FamilyConnection>): List<Point> {
            val result = mutableSetOf<Point>()
            families.indices.forEach { first ->
                ((first + 1) until families.size).forEach { second ->
                    families[first].segments.forEach { a -> families[second].segments.forEach { b ->
                        crossing(a, b)?.let(result::add)
                    } }
                }
            }
            return result.sortedWith(compareBy<Point> { it.y }.thenBy { it.x })
        }

        private fun crossing(first: Segment, second: Segment): Point? {
            val horizontal = when {
                first.orientation == SegmentOrientation.HORIZONTAL && second.orientation == SegmentOrientation.VERTICAL -> first
                second.orientation == SegmentOrientation.HORIZONTAL && first.orientation == SegmentOrientation.VERTICAL -> second
                else -> return null
            }
            val vertical = if (horizontal === first) second else first
            return Point(vertical.start.x, horizontal.start.y).takeIf {
                it.x in min(horizontal.start.x, horizontal.end.x)..max(horizontal.start.x, horizontal.end.x) &&
                    it.y in min(vertical.start.y, vertical.end.y)..max(vertical.start.y, vertical.end.y)
            }
        }

        private fun stableId(ids: List<String>) = ids.joinToString("|") { "${it.length}:$it" }
    }
}

private data class MutableFamily(
    val id: String,
    val parentIds: List<String>,
    val childIds: List<String>,
    val parentCenters: List<Point>,
    val parentPorts: MutableList<Point>,
    val parentLabelBottoms: List<Double>,
    val children: List<Point>,
    var laneIndex: Int = 0,
    var laneCount: Int = 1,
    var branchOffset: Double = 0.0,
    var segments: List<Segment> = emptyList(),
    var junctions: List<Point> = emptyList(),
) {
    val minX = (parentCenters + children).minOf { it.x }
    val maxX = (parentCenters + children).maxOf { it.x }
    val band = parentCenters.map { it.y }.average().roundToInt() to children.map { it.y }.average().roundToInt()

    fun route() {
        val parentStartY = parentCenters.zip(parentLabelBottoms).maxOf { it.first.y + it.second }
        val childTopY = children.minOf { it.y - TreeVisualMetrics.AvatarRadius }
        val availableHeight = max(childTopY - parentStartY - 32, 0.0)
        val spacing = if (laneCount > 1) max(2.0, min(12.0, availableHeight / ((laneCount - 1) * 2))) else 0.0
        val parentJoinY = parentStartY + 8 + laneIndex * spacing
        val childRailY = childTopY - 8 - (laneCount - 1 - laneIndex) * spacing
        val centeredLane = laneIndex - (laneCount - 1) / 2.0
        val trunkX = parentPorts.map { it.x }.average() + centeredLane * 8
        val parentRange = min(parentPorts.minOf { it.x }, trunkX)..max(parentPorts.maxOf { it.x }, trunkX)
        val childRange = min(children.minOf { it.x }, trunkX)..max(children.maxOf { it.x }, trunkX)
        branchOffset = childRailY - (parentStartY + childTopY) / 2
        segments = buildList {
            parentPorts.indices.forEach { index ->
                add(Segment(Point(parentPorts[index].x, parentCenters[index].y + parentLabelBottoms[index]), Point(parentPorts[index].x, parentJoinY)))
            }
            add(Segment(Point(parentRange.start, parentJoinY), Point(parentRange.endInclusive, parentJoinY)))
            add(Segment(Point(trunkX, parentJoinY), Point(trunkX, childRailY)))
            add(Segment(Point(childRange.start, childRailY), Point(childRange.endInclusive, childRailY)))
            children.forEach { child ->
                add(Segment(Point(child.x, childRailY), Point(child.x, child.y - TreeVisualMetrics.AvatarRadius)))
            }
        }.filter { it.orientation != null }
        junctions = listOf(Point(trunkX, parentJoinY), Point(trunkX, childRailY))
    }

    fun freeze() = FamilyConnection(
        id, parentIds, childIds, parentCenters, parentPorts.toList(), children,
        laneIndex, laneCount, branchOffset, segments, junctions,
    )
}
