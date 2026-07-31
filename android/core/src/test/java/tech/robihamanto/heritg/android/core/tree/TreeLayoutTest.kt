package tech.robihamanto.heritg.android.core.tree

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import tech.robihamanto.heritg.android.core.domain.PersonSnapshot
import tech.robihamanto.heritg.android.core.domain.RelationshipSnapshot
import tech.robihamanto.heritg.android.core.model.PersonGender
import tech.robihamanto.heritg.android.core.model.RelationshipKind

class TreeLayoutTest {
    @Test fun generationLimitsAndConstantsMatchIos() {
        val ids = listOf("a2", "a1", "focus", "d1", "d2")
        val people = ids.map { PersonSnapshot(it, it, PersonGender.UNSPECIFIED) }
        val relationships = ids.zipWithNext().mapIndexed { index, pair ->
            RelationshipSnapshot("e$index", pair.first, pair.second, RelationshipKind.PARENT)
        }
        val layout = TreeLayout.make(
            null, people, relationships, "focus", TreeGenerationLimits(ancestorLevels = 1, descendantLevels = 1),
        )
        assertEquals(setOf("a1", "focus", "d1"), layout.nodes.map { it.id }.toSet())
        assertEquals(260.0, TreeVisualMetrics.HorizontalSpacing, 0.0)
        assertEquals(260.0, TreeVisualMetrics.GenerationSpacing, 0.0)
        assertEquals(32.0, TreeVisualMetrics.AvatarRadius, 0.0)
        assertEquals(190.0, TreeVisualMetrics.NodeLabelWidth, 0.0)
    }

    @Test fun routePlanningGroupsSiblingsAndIsDeterministic() {
        val nodes = listOf(
            node("a", -100.0, 0.0), node("b", 100.0, 0.0),
            node("c", -100.0, 260.0), node("d", 100.0, 260.0),
        )
        val edges = listOf("a" to "c", "b" to "c", "a" to "d", "b" to "d").mapIndexed { index, pair ->
            TreeEdgeLayout("e$index", pair.first, pair.second, nodePoint(nodes, pair.first), nodePoint(nodes, pair.second),
                RelationshipKind.PARENT, tech.robihamanto.heritg.android.core.model.RelationshipSubtype.BIOLOGICAL_PARENT)
        }
        val forward = TreeConnectionPlan.make(TreeLayoutResult(nodes, edges))
        val reversed = TreeConnectionPlan.make(TreeLayoutResult(nodes, edges.reversed()))
        assertEquals(1, forward.families.size)
        assertEquals(setOf("c", "d"), forward.families.single().childIds.toSet())
        assertEquals(forward, reversed)
        assertTrue(forward.families.single().junctions.size == 2)
    }

    private fun node(id: String, x: Double, y: Double) = TreeNodeLayout(
        id, PersonSnapshot(id, id, PersonGender.UNSPECIFIED), "Family member", Point(x, y),
    )
    private fun nodePoint(nodes: List<TreeNodeLayout>, id: String) = nodes.first { it.id == id }.position
}
