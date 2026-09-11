package tech.robihamanto.heritg.android

import android.content.ContentResolver
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.net.Uri
import android.provider.OpenableColumns
import androidx.core.content.FileProvider
import androidx.exifinterface.media.ExifInterface
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import tech.robihamanto.heritg.android.core.domain.semanticFormatter
import tech.robihamanto.heritg.android.core.interop.TreeRoutingException
import tech.robihamanto.heritg.android.core.tree.TreeConnectionPlan
import tech.robihamanto.heritg.android.core.tree.TreeLayoutResult
import tech.robihamanto.heritg.android.core.tree.TreeTextMeasurer
import java.io.ByteArrayOutputStream
import java.io.ByteArrayInputStream
import java.io.File
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.UUID
import kotlin.math.max
import kotlin.math.sqrt

object LocalFiles {
    const val EncryptedArchiveMime = "application/vnd.heritg.family-archive"
    const val UnencryptedArchiveMime = "application/vnd.heritg.family-archive+zip"
    val ArchiveMimeTypes: Array<String>
        get() = arrayOf(EncryptedArchiveMime, UnencryptedArchiveMime, "application/octet-stream", "application/zip")

    suspend fun displayName(contentResolver: ContentResolver, uri: Uri): String? = withContext(Dispatchers.IO) {
        contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) cursor.getString(0) else null
        }
    }

    suspend fun read(contentResolver: ContentResolver, uri: Uri, maximum: Int): ByteArray = withContext(Dispatchers.IO) {
        val declared = contentResolver.openAssetFileDescriptor(uri, "r")?.use { it.length }
        if (declared != null && declared > maximum) throw LocalFileException.TooLarge
        contentResolver.openInputStream(uri)?.use { input ->
            val output = ByteArrayOutputStream()
            val buffer = ByteArray(16 * 1024)
            var total = 0
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                total += count
                if (total > maximum) throw LocalFileException.TooLarge
                output.write(buffer, 0, count)
            }
            output.toByteArray()
        } ?: throw LocalFileException.OpenFailed
    }

    suspend fun share(context: Context, bytes: ByteArray, name: String, mime: String) {
        val uri = withContext(Dispatchers.IO) {
            val root = File(context.cacheDir, "exports").apply { mkdirs() }
            root.listFiles()?.filter { it.lastModified() < System.currentTimeMillis() - ExportLifetimeMillis }
                ?.forEach(File::deleteRecursively)
            val directory = File(root, UUID.randomUUID().toString()).apply {
                if (!mkdirs()) throw LocalFileException.OpenFailed
            }
            val file = File(directory, safeName(name))
            file.outputStream().use { it.write(bytes) }
            FileProvider.getUriForFile(context, "${context.packageName}.files", file)
        }
        context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply {
            type = mime; putExtra(Intent.EXTRA_STREAM, uri); addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }, context.getString(R.string.share)))
    }

    suspend fun download(context: Context, uri: Uri, bytes: ByteArray) = withContext(Dispatchers.IO) {
        context.contentResolver.openOutputStream(uri)?.use { it.write(bytes) } ?: throw LocalFileException.OpenFailed
    }

    private fun safeName(value: String): String {
        val sanitized = value.replace(Regex("[^A-Za-z0-9._-]"), "-").take(120)
        return sanitized.takeIf { it.isNotBlank() && it != "." && it != ".." } ?: "heritg-export"
    }

    private const val ExportLifetimeMillis = 86_400_000L
}

internal class AndroidTreeTextMeasurer(density: Float) : TreeTextMeasurer {
    private val logicalDensity = density.also { require(it > 0f) }
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)

    @Synchronized
    override fun measureWidth(text: String, fontSize: Double, bold: Boolean): Double {
        paint.textSize = (fontSize * logicalDensity).toFloat()
        paint.typeface = if (bold) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
        return (paint.measureText(text) / logicalDensity).toDouble()
    }
}

object TreePngExporter {
    fun export(
        layout: TreeLayoutResult,
        relationshipLabels: Boolean,
        exportedAt: Instant = Instant.now(),
        locale: Locale = Locale.getDefault(),
        textMeasurer: TreeTextMeasurer = AndroidTreeTextMeasurer(1f),
    ): ByteArray {
        val formatter = semanticFormatter(locale)
        val plan = TreeConnectionPlan.make(layout, relationshipLabels, formatter, textMeasurer)
        if (!plan.isValid) throw TreeRoutingException()
        val bounds = plan.drawingBounds(layout.nodes)
        val logicalHeight = bounds.height + 56
        val exportScale = minOf(
            3.0,
            8_192.0 / max(bounds.width, logicalHeight),
            sqrt(24_000_000.0 / (bounds.width * logicalHeight)),
        ).coerceAtLeast(.01)
        val width = kotlin.math.ceil(bounds.width * exportScale).toInt().coerceAtLeast(1)
        val contentHeight = kotlin.math.ceil(bounds.height * exportScale).toInt().coerceAtLeast(1)
        val footer = kotlin.math.ceil(56 * exportScale).toInt().coerceAtLeast(1)
        val bitmap = Bitmap.createBitmap(width, contentHeight + footer, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.drawColor(Color.WHITE)
        val line = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = Color.rgb(140, 140, 140)
            alpha = 115
            strokeWidth = (1.5 * exportScale).toFloat()
            strokeCap = Paint.Cap.ROUND
            strokeJoin = Paint.Join.ROUND
            style = Paint.Style.STROKE
        }
        fun x(value: Double) = ((value - bounds.minX) * exportScale).toFloat()
        fun y(value: Double) = ((value - bounds.minY) * exportScale).toFloat()
        plan.families.flatMap { it.segments }.forEach { canvas.drawLine(x(it.start.x), y(it.start.y), x(it.end.x), y(it.end.y), line) }
        plan.nonParentRoutes.flatMap { it.segments }.forEach {
            canvas.drawLine(x(it.start.x), y(it.start.y), x(it.end.x), y(it.end.y), line)
        }
        val junction = Paint(line).apply { style = Paint.Style.FILL }
        plan.families.flatMap { it.junctions }.forEach {
            canvas.drawCircle(x(it.x), y(it.y), (2 * exportScale).toFloat(), junction)
        }
        plan.crossings.forEach {
            canvas.drawCircle(x(it.x), y(it.y), (4 * exportScale).toFloat(), Paint().apply { color = Color.WHITE })
            canvas.drawLine(x(it.x), y(it.y - 5), x(it.x), y(it.y + 5), line)
        }
        val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE; style = Paint.Style.FILL }
        val text = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(32, 52, 46); textAlign = Paint.Align.CENTER }
        plan.nonParentRoutes.forEach { route -> route.edge.marriageLabel(formatter)?.let { label ->
            val position = route.labelPosition ?: return@let
            val obstacle = route.labelObstacle ?: return@let
            val cx = x(position.x)
            val cy = y(position.y)
            text.textSize = (12 * exportScale).toFloat()
            text.isFakeBoldText = false
            canvas.drawRoundRect(
                RectF(x(obstacle.rect.minX), y(obstacle.rect.minY), x(obstacle.rect.maxX), y(obstacle.rect.maxY)),
                (obstacle.rect.height / 2 * exportScale).toFloat(),
                (obstacle.rect.height / 2 * exportScale).toFloat(), fill,
            )
            text.color = Color.GRAY
            val maximumLabelWidth = ((obstacle.rect.width - 14) * exportScale).toFloat().coerceAtLeast(1f)
            if (text.measureText(label) > maximumLabelWidth) {
                text.textSize *= maximumLabelWidth / text.measureText(label)
            }
            canvas.drawText(label, cx, cy + (4 * exportScale).toFloat(), text)
        } }
        layout.nodes.forEach { node ->
            val cx = x(node.position.x); val cy = y(node.position.y)
            canvas.drawCircle(cx, cy, (32 * exportScale).toFloat(), fill)
            node.person.profilePhotoData?.let { PhotoTools.decode(it, (50 * exportScale).toInt().coerceAtLeast(1)) }?.let { photo ->
                drawCircularPhoto(canvas, photo, cx, cy, (25 * exportScale).toFloat())
                photo.recycle()
            } ?: run {
                canvas.drawCircle(cx, cy, (25 * exportScale).toFloat(), Paint(Paint.ANTI_ALIAS_FLAG).apply {
                    color = Color.rgb(242, 245, 247)
                })
                text.color = Color.BLACK
                text.textSize = (24 * exportScale).toFloat()
                text.isFakeBoldText = true
                canvas.drawText(node.person.name.take(1).uppercase(), cx, cy + (8 * exportScale).toFloat(), text)
            }
            canvas.drawCircle(cx, cy, (32 * exportScale).toFloat(), line)
            text.color = Color.rgb(32, 52, 46)
            drawFittedText(canvas, text, node.person.name, cx, cy + (58 * exportScale).toFloat(), 16f, exportScale, true)
            if (relationshipLabels) {
                text.color = Color.GRAY
                drawFittedText(canvas, text, node.role, cx, cy + (78 * exportScale).toFloat(), 13f, exportScale, false)
            }
            node.person.lifeSummary?.let {
                text.color = Color.GRAY
                drawFittedText(canvas, text, it, cx, cy + ((if (relationshipLabels) 96 else 78) * exportScale).toFloat(),
                    11f, exportScale, false)
            }
        }
        text.textAlign = Paint.Align.RIGHT; text.textSize = (14 * exportScale).toFloat(); text.isFakeBoldText = true
        text.color = Color.DKGRAY
        val zoned = exportedAt.atZone(ZoneId.systemDefault())
        canvas.drawText("© ${zoned.year} Hamanto Studio™", width - (28 * exportScale).toFloat(),
            contentHeight + (23 * exportScale).toFloat(), text)
        text.textSize = (11 * exportScale).toFloat(); text.isFakeBoldText = false
        canvas.drawText(DateTimeFormatter.ofPattern("d MMM uuuu", locale).format(zoned),
            width - (28 * exportScale).toFloat(), contentHeight + (40 * exportScale).toFloat(), text)
        return ByteArrayOutputStream().use { output -> bitmap.compress(Bitmap.CompressFormat.PNG, 100, output); bitmap.recycle(); output.toByteArray() }
    }

    private fun drawCircularPhoto(canvas: Canvas, bitmap: Bitmap, cx: Float, cy: Float, radius: Float) {
        val side = radius * 2
        val scale = max(side / bitmap.width, side / bitmap.height)
        val matrix = Matrix().apply {
            setScale(scale, scale)
            postTranslate(cx - bitmap.width * scale / 2, cy - bitmap.height * scale / 2)
        }
        canvas.drawCircle(cx, cy, radius, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            shader = BitmapShader(bitmap, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP).also { it.setLocalMatrix(matrix) }
        })
    }

    private fun drawFittedText(
        canvas: Canvas, paint: Paint, value: String, x: Float, y: Float, size: Float, scale: Double, bold: Boolean,
    ) {
        paint.textSize = (size * scale).toFloat()
        paint.isFakeBoldText = bold
        val maximum = (190 * scale).toFloat()
        if (paint.measureText(value) > maximum) paint.textSize *= maximum / paint.measureText(value)
        canvas.drawText(value, x, y, paint)
    }
}

object PhotoTools {
    fun decode(data: ByteArray, maximum: Int): Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(data, 0, data.size, bounds)
        var sample = 1
        while (max(bounds.outWidth, bounds.outHeight) / sample > maximum) sample *= 2
        val decoded = BitmapFactory.decodeByteArray(data, 0, data.size, BitmapFactory.Options().apply { inSampleSize = sample })
            ?: return null
        val exif = runCatching { ExifInterface(ByteArrayInputStream(data)) }.getOrNull()
        val orientation = exif?.rotationDegrees ?: 0
        val flipped = exif?.isFlipped == true
        if (orientation == 0 && !flipped) return decoded
        val rotated = Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height,
            Matrix().apply {
                if (flipped) postScale(-1f, 1f)
                postRotate(orientation.toFloat())
            }, true)
        if (rotated !== decoded) decoded.recycle()
        return rotated
    }

    fun crop(bitmap: Bitmap, zoom: Float, offsetX: Float, offsetY: Float, viewport: Float): ByteArray {
        if (viewport <= 0 || bitmap.width <= 0 || bitmap.height <= 0) throw PhotoEditException.CropFailed
        val actualZoom = zoom.coerceIn(1f, 4f)
        val baseScale = max(viewport / bitmap.width, viewport / bitmap.height)
        val sourceSide = (viewport / (baseScale * actualZoom)).coerceAtMost(minOf(bitmap.width, bitmap.height).toFloat())
        val maxX = bitmap.width - sourceSide
        val maxY = bitmap.height - sourceSide
        val x = (bitmap.width / 2f - offsetX / (baseScale * actualZoom) - sourceSide / 2).coerceIn(0f, maxX)
        val y = (bitmap.height / 2f - offsetY / (baseScale * actualZoom) - sourceSide / 2).coerceIn(0f, maxY)
        val side = sourceSide.toInt().coerceAtLeast(1)
        val source = Bitmap.createBitmap(bitmap, x.toInt(), y.toInt(), side, side)
        return ByteArrayOutputStream().use { output ->
            if (!source.compress(Bitmap.CompressFormat.JPEG, 85, output)) throw PhotoEditException.CropFailed
            source.recycle()
            output.toByteArray()
        }
    }
}
