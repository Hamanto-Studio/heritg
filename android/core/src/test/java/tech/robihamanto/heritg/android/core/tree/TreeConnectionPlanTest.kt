package tech.robihamanto.heritg.android.core.tree

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import tech.robihamanto.heritg.android.core.domain.EnglishSemanticFormatter
import tech.robihamanto.heritg.android.core.domain.PersonSnapshot
import tech.robihamanto.heritg.android.core.domain.SemanticFormatter
import tech.robihamanto.heritg.android.core.model.PersonGender
import tech.robihamanto.heritg.android.core.model.RelationshipKind
import tech.robihamanto.heritg.android.core.model.RelationshipSubtype
import kotlin.math.max
import kotlin.math.min

class TreeConnectionPlanTest {
    @Test fun canonicalMetricsAndNodeObstaclesArePorted() {
        val layout = layout(mapOf("person" to Point(0.0, 0.0)))
        val obstacles = TreeObstacleRouter.nodeObstacles(layout, true)

        assertEquals(44.0, TreeVisualMetrics.MinimumTapTarget, 0.0)
        assertEquals(8.0, TreeVisualMetrics.ConnectorClearance, 0.0)
        assertEquals(10.0, TreeVisualMetrics.NodeLabelTopSpacing, 0.0)
        assertEquals(56.0, TreeVisualMetrics.nodeLabelHeight(true, true), 0.0)
        assertEquals(4, obstacles.size)
        assertTrue(obstacles.any { it.kind is TreeObstacleKind.Avatar })
        assertTrue(obstacles.any { it.kind is TreeObstacleKind.NodeLabel })
        assertEquals(
            listOf(44.0, 44.0),
            obstacles.filter { it.kind is TreeObstacleKind.AddControl || it.kind is TreeObstacleKind.EditControl }
                .map { it.rect.width },
        )
    }

    @Test fun siblingsWithTheSameParentsUseOneFamilyRoute() {
        val positions = mapOf(
            "parent-a" to Point(-130.0, 0.0),
            "parent-b" to Point(130.0, 0.0),
            "child-a" to Point(-260.0, 260.0),
            "child-b" to Point(0.0, 260.0),
            "child-c" to Point(260.0, 260.0),
        )
        val plan = TreeConnectionPlan.make(
            layout(
                positions,
                listOf(
                    "parent-a" to "child-a", "parent-b" to "child-a",
                    "parent-a" to "child-b", "parent-b" to "child-b",
                    "parent-a" to "child-c", "parent-b" to "child-c",
                ),
            ),
        )

        assertEquals(1, plan.families.size)
        assertEquals(setOf("parent-a", "parent-b"), plan.families.single().parentIds.toSet())
        assertEquals(setOf("child-a", "child-b", "child-c"), plan.families.single().childIds.toSet())
        assertTrue(plan.nonParentRoutes.isEmpty())
    }

    @Test fun oneParentWithMultipleFamiliesGetsDistinctPortsAndTracks() {
        val positions = mapOf(
            "shared" to Point(0.0, 0.0),
            "partner-a" to Point(-260.0, 0.0),
            "partner-b" to Point(260.0, 0.0),
            "child-a" to Point(-130.0, 260.0),
            "child-b" to Point(130.0, 260.0),
        )
        val plan = TreeConnectionPlan.make(
            layout(
                positions,
                listOf(
                    "shared" to "child-a", "partner-a" to "child-a",
                    "shared" to "child-b", "partner-b" to "child-b",
                ),
            ),
        )
        val sharedPorts = plan.families.map { family ->
            family.parentPorts[family.parentIds.indexOf("shared")].x
        }

        assertEquals(2, plan.families.size)
        assertEquals(2, sharedPorts.toSet().size)
        assertEquals(2, plan.families.map { it.branchOffset }.toSet().size)
    }

    @Test fun connectionBoundsIncludeOffscreenBranches() {
        val plan = TreeConnectionPlan.make(
            layout(
                mapOf(
                    "parent" to Point(0.0, 0.0),
                    "left-child" to Point(-780.0, 260.0),
                    "right-child" to Point(780.0, 260.0),
                ),
                listOf("parent" to "left-child", "parent" to "right-child"),
            ),
        )

        assertEquals(-780.0, plan.connectorBounds.minX, 0.0)
        assertEquals(780.0, plan.connectorBounds.maxX, 0.0)
        assertEquals(228.0, plan.connectorBounds.maxY, 0.0)
        assertTrue(plan.drawingBounds(emptyList()).width > plan.connectorBounds.width)
    }

    @Test fun routePlanningIsDeterministicWhenInputsAreReordered() {
        val positions = mapOf(
            "a" to Point(-100.0, 0.0), "b" to Point(100.0, 0.0),
            "c" to Point(-100.0, 260.0), "d" to Point(100.0, 260.0),
        )
        val pairs = listOf("a" to "c", "b" to "c", "a" to "d", "b" to "d")
        val forwardLayout = layout(positions, pairs)
        val reversedLayout = TreeLayoutResult(forwardLayout.nodes.reversed(), forwardLayout.edges.reversed())

        assertEquals(TreeConnectionPlan.make(forwardLayout), TreeConnectionPlan.make(reversedLayout))
    }

    @Test fun separateFamiliesNeverShareACollinearVerticalChannel() {
        val positions = mapOf(
            "a" to Point(-100.0, 0.0), "b" to Point(100.0, 0.0),
            "c" to Point(-112.0, 0.0), "d" to Point(96.0, 0.0),
            "child-a" to Point(-20.0, 260.0), "child-b" to Point(20.0, 260.0),
        )
        val plan = TreeConnectionPlan.make(
            layout(
                positions,
                listOf(
                    "a" to "child-a", "b" to "child-a",
                    "c" to "child-b", "d" to "child-b",
                ),
            ),
        )

        plan.families.indices.forEach { firstIndex ->
            ((firstIndex + 1)..<plan.families.size).forEach { secondIndex ->
                val first = plan.families[firstIndex].segments.filter { it.orientation == SegmentOrientation.VERTICAL }
                val second = plan.families[secondIndex].segments.filter { it.orientation == SegmentOrientation.VERTICAL }
                assertFalse(first.any { a -> second.any { b -> verticallyOverlaps(a, b) } })
            }
        }
        assertFalse(plan.hasCollinearConnectorOverlaps)
    }

    @Test fun unavoidableCrossingsAreReportedAsBridgesNotJunctions() {
        val positions = mapOf(
            "outer-left" to Point(-520.0, 0.0), "outer-right" to Point(520.0, 0.0),
            "inner-left" to Point(-260.0, 0.0), "inner-right" to Point(260.0, 0.0),
            "child-a" to Point(260.0, 260.0), "child-b" to Point(-260.0, 260.0),
        )
        val plan = TreeConnectionPlan.make(
            layout(
                positions,
                listOf(
                    "outer-left" to "child-a", "outer-right" to "child-a",
                    "inner-left" to "child-b", "inner-right" to "child-b",
                ),
            ),
        )

        assertTrue(plan.crossings.isNotEmpty())
        assertTrue(plan.isValid)
        assertTrue(plan.crossings.none { it in plan.families.flatMap { family -> family.junctions } })
    }

    @Test fun localizedMarriageLabelControlsPlannedObstacleWidthAndKeepsRouteValid() {
        val left = TreeNodeLayout(
            "left", PersonSnapshot("left", "Left", PersonGender.FEMALE), "You", Point(-260.0, 0.0),
        )
        val right = TreeNodeLayout(
            "right", PersonSnapshot("right", "Right", PersonGender.MALE), "Husband", Point(260.0, 0.0),
        )
        val edge = TreeEdgeLayout(
            "partner", left.id, right.id, left.position, right.position,
            RelationshipKind.PARTNER, RelationshipSubtype.SPOUSE, "2015",
        )
        val layout = TreeLayoutResult(listOf(left, right), listOf(edge))
        val longFormatter = SemanticFormatter { key, arguments ->
            if (key == "Married") "Joined together in a lifelong marriage ceremony"
            else EnglishSemanticFormatter.text(key, *arguments)
        }

        val englishPlan = TreeConnectionPlan.make(layout, true)
        val localizedPlan = TreeConnectionPlan.make(layout, true, longFormatter)
        val localizedRoute = localizedPlan.nonParentRoutes.single()
        val localizedLabel = requireNotNull(edge.marriageLabel(longFormatter))
        val localizedObstacle = requireNotNull(localizedRoute.labelObstacle)

        assertEquals(
            TreeVisualMetrics.relationshipLabelRect(localizedLabel, requireNotNull(localizedRoute.labelPosition)).width,
            localizedObstacle.rect.width,
            0.0,
        )
        assertTrue(localizedObstacle.rect.width > requireNotNull(englishPlan.nonParentRoutes.single().labelObstacle).rect.width)
        assertTrue(localizedPlan.isValid)
    }

    @Test fun measuredWideAndLocalizedTextControlsRelationshipLabelBounds() {
        val measurer = TreeTextMeasurer { text, _, _ ->
            when (text) {
                "WWWW" -> 128.2
                "結婚しました" -> 176.4
                else -> 10.0
            }
        }

        assertEquals(
            143.0,
            TreeVisualMetrics.relationshipLabelRect("WWWW", Point(0.0, 0.0), measurer).width,
            0.0,
        )
        assertEquals(
            191.0,
            TreeVisualMetrics.relationshipLabelRect("結婚しました", Point(0.0, 0.0), measurer).width,
            0.0,
        )
    }

    @Test fun partnerLabelsOnlyDescribeKnownMarriageYears() {
        val left = Point(-100.0, 0.0)
        val right = Point(100.0, 0.0)
        val undated = TreeEdgeLayout(
            "undated", "left", "right", left, right,
            RelationshipKind.PARTNER, RelationshipSubtype.SPOUSE,
        )
        val dated = undated.copy(id = "dated", marriageYear = "2015")

        assertNull(undated.marriageLabel())
        assertEquals("Married 2015", dated.marriageLabel())
    }

    private fun layout(
        positions: Map<String, Point>,
        parentPairs: List<Pair<String, String>> = emptyList(),
    ): TreeLayoutResult {
        val nodes = positions.keys.sorted().map { id ->
            TreeNodeLayout(id, PersonSnapshot(id, id, PersonGender.UNSPECIFIED), "Family member", positions.getValue(id))
        }
        val edges = parentPairs.mapIndexed { index, (from, to) ->
            TreeEdgeLayout(
                "parent-$index", from, to, positions.getValue(from), positions.getValue(to),
                RelationshipKind.PARENT, RelationshipSubtype.BIOLOGICAL_PARENT,
            )
        }
        return TreeLayoutResult(nodes, edges)
    }

    private fun verticallyOverlaps(first: Segment, second: Segment): Boolean =
        first.start.x == second.start.x &&
            max(min(first.start.y, first.end.y), min(second.start.y, second.end.y)) <
            min(max(first.start.y, first.end.y), max(second.start.y, second.end.y))
}
