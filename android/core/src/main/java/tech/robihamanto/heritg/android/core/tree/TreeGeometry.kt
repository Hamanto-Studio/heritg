package tech.robihamanto.heritg.android.core.tree

import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

data class Point(val x: Double, val y: Double)

fun interface TreeTextMeasurer {
    fun measureWidth(text: String, fontSize: Double, bold: Boolean): Double
}

object PortableTreeTextMeasurer : TreeTextMeasurer {
    override fun measureWidth(text: String, fontSize: Double, bold: Boolean): Double =
        text.length * fontSize * 7.0 / 12.0
}

data class TreeRect(val x: Double, val y: Double, val width: Double, val height: Double) {
    val minX: Double get() = min(x, x + width)
    val maxX: Double get() = max(x, x + width)
    val minY: Double get() = min(y, y + height)
    val maxY: Double get() = max(y, y + height)

    fun insetBy(dx: Double, dy: Double) = TreeRect(
        minX + dx,
        minY + dy,
        maxX - minX - dx * 2,
        maxY - minY - dy * 2,
    )

    fun intersects(other: TreeRect): Boolean =
        max(minX, other.minX) < min(maxX, other.maxX) &&
            max(minY, other.minY) < min(maxY, other.maxY)
}

enum class TreeNodeSide { RIGHT, LEFT, TOP, BOTTOM, TOP_RIGHT, TOP_LEFT }

sealed interface TreeObstacleKind {
    val stableId: String

    data class Avatar(val personId: String) : TreeObstacleKind {
        override val stableId = "0:$personId"
    }

    data class NodeLabel(val personId: String) : TreeObstacleKind {
        override val stableId = "1:$personId"
    }

    data class AddControl(val personId: String) : TreeObstacleKind {
        override val stableId = "2:$personId"
    }

    data class EditControl(val personId: String) : TreeObstacleKind {
        override val stableId = "3:$personId"
    }

    data class RelationshipLabel(val edgeId: String) : TreeObstacleKind {
        override val stableId = "4:$edgeId"
    }
}

data class TreeObstacle(val kind: TreeObstacleKind, val rect: TreeRect)

object TreeVisualMetrics {
    const val MinimumTapTarget = 44.0
    const val AvatarDiameter = 64.0
    const val AvatarRadius = AvatarDiameter / 2
    const val HorizontalSpacing = 260.0
    const val GenerationSpacing = 260.0
    const val LabelOffset = 66.0
    const val LabelHeight = 72.0
    const val NodeLabelWidth = 190.0
    const val NodeLabelTopSpacing = 10.0
    const val ConnectorClearance = 8.0
    const val RelationshipLabelHeight = 20.0

    fun avatarRect(center: Point) = TreeRect(
        center.x - AvatarRadius,
        center.y - AvatarRadius,
        AvatarDiameter,
        AvatarDiameter,
    )

    fun nodeLabelRect(center: Point, showsRelationship: Boolean, showsLifeSummary: Boolean) = TreeRect(
        center.x - NodeLabelWidth / 2,
        center.y + AvatarRadius + NodeLabelTopSpacing,
        NodeLabelWidth,
        nodeLabelHeight(showsRelationship, showsLifeSummary),
    )

    fun controlRect(center: Point) = TreeRect(
        center.x - MinimumTapTarget / 2,
        center.y - MinimumTapTarget / 2,
        MinimumTapTarget,
        MinimumTapTarget,
    )

    fun relationshipLabelRect(
        text: String,
        center: Point,
        textMeasurer: TreeTextMeasurer = PortableTreeTextMeasurer,
    ): TreeRect {
        val width = max(44.0, min(240.0, ceil(textMeasurer.measureWidth(text, 12.0, false)) + 14))
        return TreeRect(center.x - width / 2, center.y - RelationshipLabelHeight / 2, width, RelationshipLabelHeight)
    }

    fun nodeLabelHeight(showsRelationship: Boolean, showsLifeSummary: Boolean): Double =
        20.0 + (if (showsRelationship) 20.0 else 0.0) + (if (showsLifeSummary) 16.0 else 0.0)

    fun nodeLabelCenterOffset(showsRelationship: Boolean, showsLifeSummary: Boolean): Double =
        AvatarRadius + NodeLabelTopSpacing + nodeLabelHeight(showsRelationship, showsLifeSummary) / 2

    fun nodeLabelBottomOffset(showsRelationship: Boolean, showsLifeSummary: Boolean): Double =
        AvatarRadius + NodeLabelTopSpacing + nodeLabelHeight(showsRelationship, showsLifeSummary)

    fun addControlSide(
        occupiedSides: Set<TreeNodeSide>,
        preferredHorizontalSide: TreeNodeSide = TreeNodeSide.LEFT,
    ): TreeNodeSide {
        val opposite = if (preferredHorizontalSide == TreeNodeSide.LEFT) TreeNodeSide.RIGHT else TreeNodeSide.LEFT
        val diagonal = if (preferredHorizontalSide == TreeNodeSide.LEFT) TreeNodeSide.TOP_LEFT else TreeNodeSide.TOP_RIGHT
        return listOf(preferredHorizontalSide, opposite, TreeNodeSide.TOP, TreeNodeSide.BOTTOM, diagonal)
            .firstOrNull { it !in occupiedSides } ?: preferredHorizontalSide
    }

    fun addControlPosition(avatarCenter: Point, scale: Double, side: TreeNodeSide): Point {
        val offset = (AvatarRadius + 34) * scale
        val bottomOffset = (LabelOffset + LabelHeight / 2 + 34) * scale
        return when (side) {
            TreeNodeSide.RIGHT -> Point(avatarCenter.x + offset, avatarCenter.y)
            TreeNodeSide.LEFT -> Point(avatarCenter.x - offset, avatarCenter.y)
            TreeNodeSide.TOP -> Point(avatarCenter.x, avatarCenter.y - offset)
            TreeNodeSide.BOTTOM -> Point(avatarCenter.x, avatarCenter.y + bottomOffset)
            TreeNodeSide.TOP_RIGHT -> Point(avatarCenter.x + offset, avatarCenter.y - offset)
            TreeNodeSide.TOP_LEFT -> Point(avatarCenter.x - offset, avatarCenter.y - offset)
        }
    }

    fun adjacentControlPosition(position: Point, scale: Double, side: TreeNodeSide): Point {
        val spacing = 34 * scale
        return when (side) {
            TreeNodeSide.RIGHT -> Point(position.x + spacing, position.y)
            TreeNodeSide.LEFT -> Point(position.x - spacing, position.y)
            TreeNodeSide.TOP -> Point(position.x, position.y - spacing)
            TreeNodeSide.BOTTOM -> Point(position.x, position.y + spacing)
            TreeNodeSide.TOP_RIGHT -> Point(position.x + spacing, position.y - spacing)
            TreeNodeSide.TOP_LEFT -> Point(position.x - spacing, position.y - spacing)
        }
    }
}

enum class SegmentOrientation { HORIZONTAL, VERTICAL }

data class Segment(val start: Point, val end: Point) {
    val orientation: SegmentOrientation?
        get() = when {
            start.y == end.y && start.x != end.x -> SegmentOrientation.HORIZONTAL
            start.x == end.x && start.y != end.y -> SegmentOrientation.VERTICAL
            else -> null
        }
    val length: Double get() = abs(end.x - start.x) + abs(end.y - start.y)
}

data class FamilyGeometry(
    val parentJoinY: Double,
    val childRailY: Double,
    val trunkX: Double,
    val parentRange: ClosedFloatingPointRange<Double>,
    val childRange: ClosedFloatingPointRange<Double>,
)

internal fun familySegments(
    parentSources: List<Point>,
    parentLabelBottoms: List<Double>,
    parents: List<Point>,
    children: List<Point>,
    geometry: FamilyGeometry,
): List<Segment> = buildList {
    parents.indices.forEach { index ->
        add(
            Segment(
                Point(parents[index].x, parentSources[index].y + parentLabelBottoms[index]),
                Point(parents[index].x, geometry.parentJoinY),
            ),
        )
    }
    add(Segment(Point(geometry.parentRange.start, geometry.parentJoinY), Point(geometry.parentRange.endInclusive, geometry.parentJoinY)))
    add(Segment(Point(geometry.trunkX, geometry.parentJoinY), Point(geometry.trunkX, geometry.childRailY)))
    add(Segment(Point(geometry.childRange.start, geometry.childRailY), Point(geometry.childRange.endInclusive, geometry.childRailY)))
    children.forEach { child ->
        add(Segment(Point(child.x, geometry.childRailY), Point(child.x, child.y - TreeVisualMetrics.AvatarRadius)))
    }
}.filter { it.orientation != null }

data class DrawingBounds(val minX: Double, val minY: Double, val width: Double, val height: Double) {
    val maxX: Double get() = minX + width
    val maxY: Double get() = minY + height
}
