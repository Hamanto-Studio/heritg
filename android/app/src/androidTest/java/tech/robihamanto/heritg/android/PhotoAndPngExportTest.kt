package tech.robihamanto.heritg.android

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import tech.robihamanto.heritg.android.core.domain.PersonSnapshot
import tech.robihamanto.heritg.android.core.model.PersonGender
import tech.robihamanto.heritg.android.core.tree.Point
import tech.robihamanto.heritg.android.core.tree.TreeLayoutResult
import tech.robihamanto.heritg.android.core.tree.TreeNodeLayout
import java.io.ByteArrayOutputStream

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
}
