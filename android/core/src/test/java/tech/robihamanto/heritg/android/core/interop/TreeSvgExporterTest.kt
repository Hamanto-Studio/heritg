package tech.robihamanto.heritg.android.core.interop

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import tech.robihamanto.heritg.android.core.domain.PersonSnapshot
import tech.robihamanto.heritg.android.core.domain.semanticFormatter
import tech.robihamanto.heritg.android.core.tree.Point
import tech.robihamanto.heritg.android.core.tree.TreeConnectionPlan
import tech.robihamanto.heritg.android.core.tree.TreeLayoutResult
import tech.robihamanto.heritg.android.core.tree.TreeNodeLayout
import tech.robihamanto.heritg.android.core.tree.TreeTextMeasurer
import tech.robihamanto.heritg.android.core.tree.TreeEdgeLayout
import tech.robihamanto.heritg.android.core.model.RelationshipKind
import tech.robihamanto.heritg.android.core.model.RelationshipSubtype
import java.time.Instant
import java.util.Locale

class TreeSvgExporterTest {
    @Test
    fun writesWhiteSemanticChartEscapedTextAndFooter() {
        val layout = TreeLayoutResult(
            nodes = listOf(TreeNodeLayout("p", PersonSnapshot("p", "Rina & <family>",
                tech.robihamanto.heritg.android.core.model.PersonGender.FEMALE, lifeSummary = "Born 1980"),
                "You", Point(0.0, 0.0))),
            edges = emptyList(),
        )

        val svg = TreeSvgExporter.export(layout, true, Instant.parse("2026-01-01T00:00:00Z"))

        assertTrue(svg.contains("fill=\"white\""))
        assertTrue(svg.contains("Rina &amp; &lt;family&gt;"))
        assertTrue(svg.contains(">You</text>"))
        assertTrue(svg.contains("Born 1980"))
        assertTrue(svg.contains("© 2026 Hamanto Studio™"))
    }

    @Test
    fun embedsPhotosInitialsUnionLabelsAndBoundedDimensions() {
        val nodes = listOf(
            TreeNodeLayout("a", PersonSnapshot("a", "Ayu", tech.robihamanto.heritg.android.core.model.PersonGender.FEMALE,
                profilePhotoData = byteArrayOf(0xff.toByte(), 0xd8.toByte(), 0xff.toByte())), "You", Point(-100.0, 0.0)),
            TreeNodeLayout("b", PersonSnapshot("b", "Budi", tech.robihamanto.heritg.android.core.model.PersonGender.MALE),
                "Husband", Point(100.0, 0.0)),
        )
        val edge = TreeEdgeLayout("union", "a", "b", nodes[0].position, nodes[1].position,
            RelationshipKind.PARTNER, RelationshipSubtype.SPOUSE, "2015")

        val svg = TreeSvgExporter.export(TreeLayoutResult(nodes, listOf(edge)), true)

        assertTrue(svg.contains("data:image/jpeg;base64,"))
        assertTrue(svg.contains(">B</text>"))
        assertTrue(svg.contains("Married 2015"))
        assertTrue(svg.contains("viewBox=\"-"))
        assertTrue(svg.contains("Hamanto Studio™"))
    }

    @Test
    fun writesEveryPlannedRouteSegmentAndUsesThePlannedMarriageLabelGeometry() {
        val layout = partnerLayout(includeMiddleNode = false)
        val plan = TreeConnectionPlan.make(layout, true)
        val route = plan.nonParentRoutes.single()
        val position = requireNotNull(route.labelPosition)
        val obstacle = requireNotNull(route.labelObstacle)

        val svg = TreeSvgExporter.export(layout, true)

        assertEquals(route.segments.size, Regex("data-route-id=\"partner\"").findAll(svg).count())
        route.segments.forEachIndexed { index, segment ->
            assertTrue(svg.contains(
                "<line x1=\"${number(segment.start.x)}\" y1=\"${number(segment.start.y)}\" " +
                    "x2=\"${number(segment.end.x)}\" y2=\"${number(segment.end.y)}\" " +
                    "data-route-id=\"partner\" data-segment-index=\"$index\"/>",
            ))
        }
        assertTrue(svg.contains(
            "data-obstacle-id=\"relationship-label:partner\" x=\"${number(obstacle.rect.minX)}\" " +
                "y=\"${number(obstacle.rect.minY)}\" width=\"${number(obstacle.rect.width)}\" " +
                "height=\"${number(obstacle.rect.height)}\"",
        ))
        assertTrue(svg.contains("<text x=\"${number(position.x)}\" y=\"${number(position.y + 4)}\""))
        assertFalse(position == Point(0.0, 0.0))
    }

    @Test
    fun doesNotExportTheOldDirectPartnerLineThroughAnInterveningNode() {
        val layout = partnerLayout(includeMiddleNode = true)
        val plan = TreeConnectionPlan.make(layout, true)
        val route = plan.nonParentRoutes.single()

        val svg = TreeSvgExporter.export(layout, true)

        assertTrue(route.segments.size > 1)
        assertFalse(svg.contains(
            "<line x1=\"-228.00\" y1=\"0.00\" x2=\"228.00\" y2=\"0.00\"",
        ))
        assertEquals(route.segments.size, Regex("data-route-id=\"partner\"").findAll(svg).count())
    }

    @Test
    fun fitsOnlyTextThatExceedsTheAvailableWidth() {
        val shortName = "Ayu"
        val longName = "A deliberately overlong family member name that must fit"
        val layout = TreeLayoutResult(
            listOf(
                TreeNodeLayout("short", PersonSnapshot("short", shortName,
                    tech.robihamanto.heritg.android.core.model.PersonGender.FEMALE), "You", Point(-130.0, 0.0)),
                TreeNodeLayout("long", PersonSnapshot("long", longName,
                    tech.robihamanto.heritg.android.core.model.PersonGender.MALE), "Husband", Point(130.0, 0.0)),
            ),
            emptyList(),
        )

        val svg = TreeSvgExporter.export(layout, true)
        val shortText = requireNotNull(Regex("<text[^>]*>$shortName</text>").find(svg)).value
        val longText = requireNotNull(Regex("<text[^>]*>$longName</text>").find(svg)).value

        assertFalse(shortText.contains("textLength="))
        assertFalse(shortText.contains("lengthAdjust="))
        assertTrue(longText.contains("textLength=\"190.00\""))
        assertTrue(longText.contains("lengthAdjust=\"spacingAndGlyphs\""))
    }

    @Test
    fun fittedTextUsesMeasuredWideAndNonLatinGlyphWidths() {
        val wideName = "WWWWWW"
        val localizedName = "家族の名前"
        val measurer = TreeTextMeasurer { text, _, _ ->
            if (text == wideName || text == localizedName) 220.0 else 20.0
        }
        val layout = TreeLayoutResult(
            listOf(
                TreeNodeLayout("wide", PersonSnapshot("wide", wideName,
                    tech.robihamanto.heritg.android.core.model.PersonGender.FEMALE), "You", Point(-130.0, 0.0)),
                TreeNodeLayout("localized", PersonSnapshot("localized", localizedName,
                    tech.robihamanto.heritg.android.core.model.PersonGender.MALE), "Husband", Point(130.0, 0.0)),
            ),
            emptyList(),
        )

        val svg = TreeSvgExporter.export(layout, true, textMeasurer = measurer)

        listOf(wideName, localizedName).forEach { name ->
            val element = requireNotNull(Regex("<text[^>]*>$name</text>").find(svg)).value
            assertTrue(element.contains("textLength=\"190.00\""))
            assertTrue(element.contains("lengthAdjust=\"spacingAndGlyphs\""))
        }
    }

    @Test
    fun localizedMarriageLabelUsesTheLocalizedPlannedGeometry() {
        val locale = Locale.forLanguageTag("id")
        val layout = partnerLayout(includeMiddleNode = false)
        val measurer = TreeTextMeasurer { text, _, _ -> if (text == "Menikah 2015") 173.0 else 20.0 }
        val plan = TreeConnectionPlan.make(layout, true, semanticFormatter(locale), measurer)
        val obstacle = requireNotNull(plan.nonParentRoutes.single().labelObstacle)

        val svg = TreeSvgExporter.export(layout, true, locale = locale, textMeasurer = measurer)

        assertTrue(svg.contains(">Menikah 2015</text>"))
        assertEquals(187.0, obstacle.rect.width, 0.0)
        assertTrue(svg.contains("width=\"${number(obstacle.rect.width)}\""))
        assertTrue(plan.isValid)
    }

    @Test
    fun rejectsAnInvalidRoutingPlan() {
        val nodes = listOf(
            TreeNodeLayout("person-a", PersonSnapshot("person-a", "A", tech.robihamanto.heritg.android.core.model.PersonGender.FEMALE), "", Point(0.0, 0.0)),
            TreeNodeLayout("person-b", PersonSnapshot("person-b", "B", tech.robihamanto.heritg.android.core.model.PersonGender.MALE), "", Point(260.0, 0.0)),
            TreeNodeLayout("right-blocker", PersonSnapshot("right-blocker", "R", tech.robihamanto.heritg.android.core.model.PersonGender.UNSPECIFIED), "", Point(32.0, 0.0)),
            TreeNodeLayout("top-blocker", PersonSnapshot("top-blocker", "T", tech.robihamanto.heritg.android.core.model.PersonGender.UNSPECIFIED), "", Point(0.0, -32.0)),
            TreeNodeLayout("left-blocker", PersonSnapshot("left-blocker", "L", tech.robihamanto.heritg.android.core.model.PersonGender.UNSPECIFIED), "", Point(-32.0, 0.0)),
        )
        val edge = TreeEdgeLayout(
            "blocked-edge", "person-a", "person-b", nodes[0].position, nodes[1].position,
            RelationshipKind.SIBLING, RelationshipSubtype.SIBLING,
        )

        try {
            TreeSvgExporter.export(TreeLayoutResult(nodes, listOf(edge)), false)
            throw AssertionError("Expected invalid routing to prevent export")
        } catch (_: TreeRoutingException) {
            // Expected.
        }
    }

    private fun partnerLayout(includeMiddleNode: Boolean): TreeLayoutResult {
        val left = TreeNodeLayout(
            "left", PersonSnapshot("left", "Left", tech.robihamanto.heritg.android.core.model.PersonGender.FEMALE),
            "You", Point(-260.0, 0.0),
        )
        val right = TreeNodeLayout(
            "right", PersonSnapshot("right", "Right", tech.robihamanto.heritg.android.core.model.PersonGender.MALE),
            "Husband", Point(260.0, 0.0),
        )
        val middle = TreeNodeLayout(
            "middle", PersonSnapshot("middle", "Middle", tech.robihamanto.heritg.android.core.model.PersonGender.UNSPECIFIED),
            "Family member", Point(0.0, 0.0),
        )
        val edge = TreeEdgeLayout(
            "partner", left.id, right.id, left.position, right.position,
            RelationshipKind.PARTNER, RelationshipSubtype.SPOUSE, "2015",
        )
        return TreeLayoutResult(listOf(left, right) + listOfNotNull(middle.takeIf { includeMiddleNode }), listOf(edge))
    }

    private fun number(value: Double) = String.format(Locale.US, "%.2f", value)
}
