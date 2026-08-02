package tech.robihamanto.heritg.android.core.tree

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import tech.robihamanto.heritg.android.core.domain.PersonSnapshot
import tech.robihamanto.heritg.android.core.domain.RelationshipSnapshot
import tech.robihamanto.heritg.android.core.model.PersonGender
import tech.robihamanto.heritg.android.core.model.RelationshipKind
import tech.robihamanto.heritg.android.core.model.RelationshipSubtype

class TreeConnectorCollisionTest {
    @Test fun parentFamilyDetoursAroundUnrelatedNodeAndControls() {
        val plan = TreeConnectionPlan.make(
            fixedLayout(
                mapOf(
                    "parent" to Point(0.0, 0.0),
                    "blocker" to Point(0.0, 260.0),
                    "child" to Point(0.0, 520.0),
                ),
                listOf(edge("parent-child", "parent", "child", RelationshipKind.PARENT)),
            ),
            true,
        )
        val family = plan.families.single()
        val blockerObstacles = plan.obstacles.filter { obstaclePersonId(it.kind) == "blocker" }

        assertTrue(family.segments.size > 3)
        assertTrue(TreeObstacleRouter.routeIsClear(family.segments, blockerObstacles))
        assertTrue("Unexpected collisions: ${plan.obstacleCollisions}", plan.isObstacleFree)
        assertTrue(plan.isValid)
    }

    @Test fun sukamtoAndFadmudikahRouteAroundKarno() {
        val positions = mapOf(
            "sukamto" to Point(-260.0, 0.0),
            "karno" to Point(0.0, 0.0),
            "fadmudikah" to Point(260.0, 0.0),
        )
        val plan = TreeConnectionPlan.make(
            fixedLayout(
                positions,
                listOf(
                    edge(
                        "sukamto-fadmudikah",
                        "sukamto",
                        "fadmudikah",
                        RelationshipKind.PARTNER,
                        RelationshipSubtype.SPOUSE,
                        "1988",
                    ),
                ),
            ),
            true,
        )
        val route = plan.nonParentRoutes.single()
        val karnoObstacles = plan.obstacles.filter { obstaclePersonId(it.kind) == "karno" }

        assertTrue(route.segments.size >= 3)
        assertTrue(TreeObstacleRouter.routeIsClear(route.segments, karnoObstacles))
        assertNotNull(route.labelPosition)
        assertTrue(karnoObstacles.all { !it.rect.intersects(route.labelObstacle!!.rect) })
        assertTrue("Unexpected failures: ${plan.routingFailures}", plan.isValid)
    }

    @Test fun suppliedSukamtoFixtureIsClearAndDeterministic() {
        val people = listOf(
            person("yatmin", PersonGender.MALE, 1), person("binem", PersonGender.FEMALE, 2),
            person("djemangun", PersonGender.MALE, 3), person("mudjiati", PersonGender.FEMALE, 4),
            person("sukamto", PersonGender.MALE, 5), person("karno", PersonGender.MALE, 7),
            person("fadmudikah", PersonGender.FEMALE, 6),
        )
        val relationships = listOf(
            relationship("yatmin-binem", "yatmin", "binem", RelationshipKind.PARTNER, RelationshipSubtype.SPOUSE),
            relationship("djemangun-mudjiati", "djemangun", "mudjiati", RelationshipKind.PARTNER, RelationshipSubtype.SPOUSE),
            relationship("yatmin-sukamto", "yatmin", "sukamto", RelationshipKind.PARENT),
            relationship("binem-sukamto", "binem", "sukamto", RelationshipKind.PARENT),
            relationship("yatmin-karno", "yatmin", "karno", RelationshipKind.PARENT),
            relationship("binem-karno", "binem", "karno", RelationshipKind.PARENT),
            relationship("djemangun-fadmudikah", "djemangun", "fadmudikah", RelationshipKind.PARENT),
            relationship("mudjiati-fadmudikah", "mudjiati", "fadmudikah", RelationshipKind.PARENT),
            relationship(
                "sukamto-fadmudikah", "sukamto", "fadmudikah",
                RelationshipKind.PARTNER, RelationshipSubtype.SPOUSE, "1988",
            ),
        )
        val layout = TreeLayout.make(null, people, relationships, "karno")
        val plan = TreeConnectionPlan.make(layout, true)
        val reversed = TreeConnectionPlan.make(TreeLayoutResult(layout.nodes.reversed(), layout.edges.reversed()), true)
        val route = plan.nonParentRoutes.first { it.id == "sukamto-fadmudikah" }
        val positions = layout.nodes.associate { it.id to it.position.x }

        assertEquals(plan, reversed)
        assertEquals(260.0, kotlin.math.abs(positions.getValue("sukamto") - positions.getValue("karno")), 0.0)
        assertEquals(260.0, kotlin.math.abs(positions.getValue("karno") - positions.getValue("fadmudikah")), 0.0)
        assertTrue(route.segments.size >= 3)
        assertTrue("Unexpected collisions: ${plan.obstacleCollisions}", plan.isObstacleFree)
        assertTrue("Unexpected failures: ${plan.routingFailures}", plan.isValid)
    }

    @Test fun relationshipLabelAvoidsFamilySegmentsAndCrossingIsReported() {
        val plan = TreeConnectionPlan.make(
            fixedLayout(
                mapOf(
                    "parent" to Point(0.0, 0.0),
                    "left-partner" to Point(-220.0, 150.0),
                    "right-partner" to Point(220.0, 150.0),
                    "child" to Point(0.0, 260.0),
                ),
                listOf(
                    edge("parent-child", "parent", "child", RelationshipKind.PARENT),
                    edge(
                        "partner-union", "left-partner", "right-partner",
                        RelationshipKind.PARTNER, RelationshipSubtype.SPOUSE, "2004",
                    ),
                ),
            ),
            true,
        )
        val label = plan.nonParentRoutes.single().labelObstacle!!

        assertTrue(plan.families.flatMap { it.segments }.all {
            !TreeObstacleRouter.segmentIntersects(it, label.rect, TreeVisualMetrics.ConnectorClearance)
        })
        assertTrue(Point(0.0, 150.0) in plan.crossings)
        assertTrue(plan.isObstacleFree)
    }

    @Test fun exhaustedRelationshipRoutingIsReportedAsInvalid() {
        val plan = TreeConnectionPlan.make(
            fixedLayout(
                mapOf(
                    "person-a" to Point(0.0, 0.0),
                    "person-b" to Point(260.0, 0.0),
                    "right-blocker" to Point(32.0, 0.0),
                    "top-blocker" to Point(0.0, -32.0),
                    "left-blocker" to Point(-32.0, 0.0),
                ),
                listOf(edge("blocked-edge", "person-a", "person-b", RelationshipKind.SIBLING)),
            ),
            false,
        )

        assertTrue(plan.nonParentRoutes.single().segments.isEmpty())
        assertEquals(listOf("relationship:blocked-edge"), plan.routingFailures)
        assertTrue(plan.hasRoutingFailures)
        assertFalse(plan.isValid)
    }

    @Test fun parallelRelationshipRoutesUseDistinctChannels() {
        val plan = TreeConnectionPlan.make(
            fixedLayout(
                mapOf(
                    "p0" to Point(0.0, 0.0), "p1" to Point(260.0, 0.0),
                    "p2" to Point(520.0, 0.0), "p3" to Point(780.0, 0.0),
                ),
                listOf(
                    edge("first", "p0", "p2", RelationshipKind.SIBLING),
                    edge("second", "p1", "p3", RelationshipKind.SIBLING),
                ),
            ),
            false,
        )

        assertEquals(2, plan.nonParentRoutes.size)
        assertFalse(plan.hasCollinearConnectorOverlaps)
        assertFalse(
            TreeObstacleRouter.hasCollinearOverlap(
                plan.nonParentRoutes[0].segments,
                plan.nonParentRoutes[1].segments,
            ),
        )
    }

    @Test fun sharedRelationshipTerminalsAreNotCrossings() {
        val plan = TreeConnectionPlan.make(
            fixedLayout(
                mapOf("p0" to Point(0.0, 0.0), "p1" to Point(260.0, 0.0), "p2" to Point(520.0, 0.0)),
                listOf(
                    edge("first", "p0", "p1", RelationshipKind.SIBLING),
                    edge("second", "p0", "p2", RelationshipKind.SIBLING),
                ),
            ),
            false,
        )
        val first = plan.nonParentRoutes.first { it.id == "first" }
        val second = plan.nonParentRoutes.first { it.id == "second" }
        val firstTerminals = listOfNotNull(first.segments.firstOrNull()?.start, first.segments.lastOrNull()?.end)
        val secondTerminals = listOfNotNull(second.segments.firstOrNull()?.start, second.segments.lastOrNull()?.end)

        assertTrue(plan.crossings.none { it in firstTerminals && it in secondTerminals })
    }

    private fun fixedLayout(
        positions: Map<String, Point>,
        edgeBuilders: List<(Map<String, Point>) -> TreeEdgeLayout>,
    ): TreeLayoutResult {
        val nodes = positions.keys.sorted().map { id ->
            TreeNodeLayout(
                id,
                PersonSnapshot(
                    id,
                    id,
                    PersonGender.UNSPECIFIED,
                    lifeSummary = if (id == "blocker") "A deliberately tall label" else null,
                ),
                "Family member",
                positions.getValue(id),
            )
        }
        return TreeLayoutResult(nodes, edgeBuilders.map { it(positions) })
    }

    private fun edge(
        id: String,
        from: String,
        to: String,
        kind: RelationshipKind,
        subtype: RelationshipSubtype = RelationshipSubtype.defaultFor(kind),
        marriageYear: String? = null,
    ): (Map<String, Point>) -> TreeEdgeLayout = { positions ->
        TreeEdgeLayout(id, from, to, positions.getValue(from), positions.getValue(to), kind, subtype, marriageYear)
    }

    private fun obstaclePersonId(kind: TreeObstacleKind): String? = when (kind) {
        is TreeObstacleKind.Avatar -> kind.personId
        is TreeObstacleKind.NodeLabel -> kind.personId
        is TreeObstacleKind.AddControl -> kind.personId
        is TreeObstacleKind.EditControl -> kind.personId
        is TreeObstacleKind.RelationshipLabel -> null
    }

    private fun person(id: String, gender: PersonGender, birth: Long) =
        PersonSnapshot(id, id, gender, lifeSummary = "Born 19${birth}0", birthEpochMillis = birth)

    private fun relationship(
        id: String,
        from: String,
        to: String,
        kind: RelationshipKind,
        subtype: RelationshipSubtype = RelationshipSubtype.defaultFor(kind),
        marriageYear: String? = null,
    ) = RelationshipSnapshot(id, from, to, kind, subtype, marriageYear)
}
