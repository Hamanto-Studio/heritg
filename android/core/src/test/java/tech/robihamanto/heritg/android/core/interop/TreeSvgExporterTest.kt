package tech.robihamanto.heritg.android.core.interop

import org.junit.Assert.assertTrue
import org.junit.Test
import tech.robihamanto.heritg.android.core.domain.PersonSnapshot
import tech.robihamanto.heritg.android.core.tree.Point
import tech.robihamanto.heritg.android.core.tree.TreeLayoutResult
import tech.robihamanto.heritg.android.core.tree.TreeNodeLayout
import tech.robihamanto.heritg.android.core.tree.TreeEdgeLayout
import tech.robihamanto.heritg.android.core.model.RelationshipKind
import tech.robihamanto.heritg.android.core.model.RelationshipSubtype
import java.time.Instant

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
        assertTrue(svg.contains("viewBox=\"0 0"))
        assertTrue(svg.contains("Hamanto Studio™"))
    }
}
