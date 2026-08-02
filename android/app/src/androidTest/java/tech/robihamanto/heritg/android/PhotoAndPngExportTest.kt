package tech.robihamanto.heritg.android

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import tech.robihamanto.heritg.android.core.domain.PersonSnapshot
import tech.robihamanto.heritg.android.core.interop.TreeRoutingException
import tech.robihamanto.heritg.android.core.model.PersonGender
import tech.robihamanto.heritg.android.core.model.RelationshipKind
import tech.robihamanto.heritg.android.core.model.RelationshipSubtype
import tech.robihamanto.heritg.android.core.tree.Point
import tech.robihamanto.heritg.android.core.tree.TreeConnectionPlan
import tech.robihamanto.heritg.android.core.tree.TreeEdgeLayout
import tech.robihamanto.heritg.android.core.tree.TreeLayoutResult
import tech.robihamanto.heritg.android.core.tree.TreeNodeLayout
import java.io.ByteArrayOutputStream
import kotlin.math.max
import kotlin.math.sqrt

@RunWith(AndroidJUnit4::class)
class PhotoAndPngExportTest {
    @Test
    fun photoDecodeDownsamplesAndCropProducesSquareJpeg() {
        val source = Bitmap.createBitmap(3_000, 1_000, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.BLUE) }
        val encoded = ByteArrayOutputStream().use { output ->
            source.compress(Bitmap.CompressFormat.JPEG, 95, output)
            output.toByteArray()
        }
        source.recycle()

        val decoded = requireNotNull(PhotoTools.decode(encoded, 2_048))
        assertTrue(maxOf(decoded.width, decoded.height) <= 2_048)
        val cropped = PhotoTools.crop(decoded, 1f, 0f, 0f, 280f)
        val result = requireNotNull(BitmapFactory.decodeByteArray(cropped, 0, cropped.size))
        assertEquals(result.width, result.height)
        assertTrue(cropped[0] == 0xff.toByte() && cropped[1] == 0xd8.toByte())
        decoded.recycle()
        result.recycle()
    }

    @Test
    fun pngExportHasWhiteBackgroundPhotoInitialAndFooterSpace() {
        val photo = Bitmap.createBitmap(20, 20, Bitmap.Config.ARGB_8888).apply { eraseColor(Color.RED) }
        val photoBytes = ByteArrayOutputStream().use { output ->
            photo.compress(Bitmap.CompressFormat.JPEG, 85, output)
            output.toByteArray()
        }
        photo.recycle()
        val layout = TreeLayoutResult(
            listOf(
                TreeNodeLayout("photo", PersonSnapshot("photo", "Ayu", PersonGender.FEMALE,
                    profilePhotoData = photoBytes), "You", Point(-100.0, 0.0)),
                TreeNodeLayout("initial", PersonSnapshot("initial", "Budi", PersonGender.MALE),
                    "Partner", Point(100.0, 0.0)),
            ),
            emptyList(),
        )

        val bytes = TreePngExporter.export(layout, true)
        val image = requireNotNull(BitmapFactory.decodeByteArray(bytes, 0, bytes.size))
        assertTrue(image.width > 0 && image.height > image.width / 2)
        assertEquals(Color.WHITE, image.getPixel(0, 0))
        image.recycle()
    }

    @Test
    fun pngExportDoesNotDrawTheOldDirectPartnerLineThroughAnInterveningNode() {
        val left = TreeNodeLayout(
            "left", PersonSnapshot("left", "Left", PersonGender.FEMALE), "You", Point(-260.0, 0.0),
        )
        val middle = TreeNodeLayout(
            "middle", PersonSnapshot("middle", "Middle", PersonGender.UNSPECIFIED),
            "Family member", Point(0.0, 0.0),
        )
        val right = TreeNodeLayout(
            "right", PersonSnapshot("right", "Right", PersonGender.MALE), "Husband", Point(260.0, 0.0),
        )
        val layout = TreeLayoutResult(
            listOf(left, middle, right),
            listOf(TreeEdgeLayout(
                "partner", left.id, right.id, left.position, right.position,
                RelationshipKind.PARTNER, RelationshipSubtype.SPOUSE, "2015",
            )),
        )
        val plan = TreeConnectionPlan.make(layout, true)
        val route = plan.nonParentRoutes.single()
        val bounds = plan.drawingBounds(layout.nodes)
        val logicalHeight = bounds.height + 56
        val scale = minOf(
            3.0,
            8_192.0 / max(bounds.width, logicalHeight),
            sqrt(24_000_000.0 / (bounds.width * logicalHeight)),
        ).coerceAtLeast(.01)
        val candidate = (-220..220 step 4).map(Int::toDouble).first { x ->
            val point = Point(x, 0.0)
            layout.nodes.none { kotlin.math.abs(it.position.x - x) <= 36 } &&
                route.segments.none { segment ->
                    segment.start.y == 0.0 && segment.end.y == 0.0 &&
                        x in minOf(segment.start.x, segment.end.x)..maxOf(segment.start.x, segment.end.x)
                } && route.labelObstacle?.rect?.let { point.x in it.minX..it.maxX && point.y in it.minY..it.maxY } != true
        }

        val bytes = TreePngExporter.export(layout, true)
        val image = requireNotNull(BitmapFactory.decodeByteArray(bytes, 0, bytes.size))
        val pixelX = ((candidate - bounds.minX) * scale).toInt()
        val pixelY = ((0.0 - bounds.minY) * scale).toInt()

        assertTrue(route.segments.size > 1)
        assertFalse(pixelX !in 0..<image.width || pixelY !in 0..<image.height)
        assertEquals(Color.WHITE, image.getPixel(pixelX, pixelY))
        image.recycle()
    }

    @Test
    fun pngExportRejectsAnInvalidRoutingPlan() {
        fun node(id: String, x: Double, y: Double) = TreeNodeLayout(
            id, PersonSnapshot(id, id, PersonGender.UNSPECIFIED), "", Point(x, y),
        )
        val nodes = listOf(
            node("person-a", 0.0, 0.0), node("person-b", 260.0, 0.0),
            node("right-blocker", 32.0, 0.0), node("top-blocker", 0.0, -32.0),
            node("left-blocker", -32.0, 0.0),
        )
        val edge = TreeEdgeLayout(
            "blocked-edge", "person-a", "person-b", nodes[0].position, nodes[1].position,
            RelationshipKind.SIBLING, RelationshipSubtype.SIBLING,
        )

        try {
            TreePngExporter.export(TreeLayoutResult(nodes, listOf(edge)), false)
            throw AssertionError("Expected invalid routing to prevent export")
        } catch (_: TreeRoutingException) {
            // Expected.
        }
    }
}
