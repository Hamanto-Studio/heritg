package tech.robihamanto.heritg.android.core.interop

import tech.robihamanto.heritg.android.core.domain.semanticFormatter
import tech.robihamanto.heritg.android.core.tree.Point
import tech.robihamanto.heritg.android.core.tree.PortableTreeTextMeasurer
import tech.robihamanto.heritg.android.core.tree.TreeConnectionPlan
import tech.robihamanto.heritg.android.core.tree.TreeLayoutResult
import tech.robihamanto.heritg.android.core.tree.TreeNodeLayout
import tech.robihamanto.heritg.android.core.tree.TreeTextMeasurer
import tech.robihamanto.heritg.android.core.tree.TreeVisualMetrics
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Base64
import java.util.Locale

class TreeRoutingException : IllegalStateException("The family tree could not be routed safely.")

object TreeSvgExporter {
    private const val FooterHeight = 56.0

    fun export(
        layout: TreeLayoutResult,
        relationshipLabels: Boolean,
        exportedAt: Instant = Instant.now(),
        locale: Locale = Locale.getDefault(),
        textMeasurer: TreeTextMeasurer = PortableTreeTextMeasurer,
    ): String {
        val formatter = semanticFormatter(locale)
        val plan = TreeConnectionPlan.make(layout, relationshipLabels, formatter, textMeasurer)
        if (!plan.isValid) throw TreeRoutingException()
        val bounds = plan.drawingBounds(layout.nodes)
        val height = bounds.height + FooterHeight
        fun x(value: Double) = value
        fun y(value: Double) = value
        return buildString {
            append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n")
            append("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"").append(number(bounds.width))
                .append("\" height=\"").append(number(height)).append("\" viewBox=\"")
                .append(number(bounds.minX)).append(' ').append(number(bounds.minY)).append(' ')
                .append(number(bounds.width)).append(' ').append(number(height)).append("\">\n")
            append("<rect x=\"").append(number(bounds.minX)).append("\" y=\"").append(number(bounds.minY))
                .append("\" width=\"").append(number(bounds.width)).append("\" height=\"").append(number(height))
                .append("\" fill=\"white\"/>\n")
            append("<g id=\"tree-connectors\" fill=\"none\" stroke=\"#8c8c8c\" stroke-opacity=\"0.45\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n")
            plan.families.forEach { family -> family.segments.forEachIndexed { index, segment ->
                append(line(segment.start, segment.end, ::x, ::y,
                    "data-family-id=\"${escape(family.id)}\" data-segment-index=\"$index\""))
            } }
            plan.nonParentRoutes.forEach { route -> route.segments.forEachIndexed { index, segment ->
                append(line(segment.start, segment.end, ::x, ::y,
                    "data-route-id=\"${escape(route.id)}\" data-segment-index=\"$index\""))
            } }
            append("</g>\n")
            plan.families.flatMap { it.junctions }.forEach { point ->
                append("<circle cx=\"").append(number(x(point.x))).append("\" cy=\"")
                    .append(number(y(point.y))).append("\" r=\"2\" fill=\"#8c8c8c\" fill-opacity=\"0.45\"/>\n")
            }
            plan.crossings.forEach { point ->
                append("<circle cx=\"").append(number(x(point.x))).append("\" cy=\"")
                    .append(number(y(point.y))).append("\" r=\"4\" fill=\"#ffffff\"/>\n")
                append(line(Point(point.x, point.y - 5), Point(point.x, point.y + 5), ::x, ::y,
                    "stroke=\"#8c8c8c\" stroke-opacity=\"0.45\" stroke-width=\"1.5\" stroke-linecap=\"round\""))
            }
            plan.nonParentRoutes.forEach { route -> route.edge.marriageLabel(formatter)?.let { label ->
                val position = route.labelPosition ?: return@let
                val obstacle = route.labelObstacle ?: return@let
                append("<rect data-obstacle-id=\"relationship-label:").append(escape(route.id))
                    .append("\" x=\"").append(number(obstacle.rect.minX)).append("\" y=\"")
                    .append(number(obstacle.rect.minY)).append("\" width=\"").append(number(obstacle.rect.width))
                    .append("\" height=\"").append(number(obstacle.rect.height)).append("\" rx=\"")
                    .append(number(obstacle.rect.height / 2)).append("\" fill=\"#ffffff\"/>\n")
                append(fittedText(
                    position.x, position.y + 4, label, 12, false, "#777777",
                    obstacle.rect.width - 14, textMeasurer,
                ))
            } }
            layout.nodes.forEachIndexed { index, node ->
                append(node(node, index, relationshipLabels, textMeasurer, ::x, ::y))
            }
            val zoned = exportedAt.atZone(ZoneId.systemDefault())
            val date = DateTimeFormatter.ofPattern("d MMM uuuu", locale).format(zoned)
            append(text(bounds.maxX - 28, bounds.maxY + 23, "© ${zoned.year} Hamanto Studio™", 14, true,
                "#666666", "end"))
            append(text(bounds.maxX - 28, bounds.maxY + 40, date, 11, false, "#666666", "end"))
            append("</svg>\n")
        }
    }

    private fun node(
        node: TreeNodeLayout,
        index: Int,
        showsRole: Boolean,
        textMeasurer: TreeTextMeasurer,
        x: (Double) -> Double,
        y: (Double) -> Double,
    ): String = buildString {
        val cx = x(node.position.x)
        val cy = y(node.position.y)
        append("<g data-person-id=\"").append(escape(node.id)).append("\">\n")
        append("<circle cx=\"").append(number(cx)).append("\" cy=\"").append(number(cy))
            .append("\" r=\"32\" fill=\"#ffffff\" stroke=\"#a6a6a6\" stroke-opacity=\"0.35\" stroke-width=\"2\"/>\n")
        val photo = node.person.profilePhotoData
        if (photo != null) {
            append("<defs><clipPath id=\"photo-").append(index).append("\"><circle cx=\"")
                .append(number(cx)).append("\" cy=\"").append(number(cy)).append("\" r=\"25\"/></clipPath></defs>\n")
            append("<image x=\"").append(number(cx - 25)).append("\" y=\"").append(number(cy - 25))
                .append("\" width=\"50\" height=\"50\" href=\"data:").append(photoMime(photo))
                .append(";base64,").append(Base64.getEncoder().encodeToString(photo))
                .append("\" preserveAspectRatio=\"xMidYMid slice\" clip-path=\"url(#photo-").append(index).append(")\"/>\n")
        } else {
            append("<circle cx=\"").append(number(cx)).append("\" cy=\"").append(number(cy))
                .append("\" r=\"25\" fill=\"#f2f5f7\"/>\n")
            append(text(cx, cy + 8, node.person.name.take(1).uppercase(), 24, true, "#000000"))
        }
        var baseline = cy + 58
        append(fittedText(cx, baseline, node.person.name, 16, true, "#000000", textMeasurer = textMeasurer))
        if (showsRole) {
            baseline += 20
            append(fittedText(cx, baseline, node.role, 13, false, "#777777", textMeasurer = textMeasurer))
        }
        node.person.lifeSummary?.let {
            baseline += 16
            append(fittedText(cx, baseline, it, 11, false, "#777777", textMeasurer = textMeasurer))
        }
        append("</g>\n")
    }

    private fun fittedText(
        x: Double,
        y: Double,
        value: String,
        size: Int,
        bold: Boolean,
        color: String,
        maximumWidth: Double = TreeVisualMetrics.NodeLabelWidth,
        textMeasurer: TreeTextMeasurer,
    ): String {
        val extra = if (textMeasurer.measureWidth(value, size.toDouble(), bold) > maximumWidth) {
            " textLength=\"${number(maximumWidth)}\" lengthAdjust=\"spacingAndGlyphs\""
        } else ""
        return text(x, y, value, size, bold, color, extra = extra)
    }

    private fun text(
        x: Double,
        y: Double,
        value: String,
        size: Int,
        bold: Boolean,
        color: String,
        anchor: String = "middle",
        extra: String = "",
    ) = "<text x=\"${number(x)}\" y=\"${number(y)}\" text-anchor=\"$anchor\" font-family=\"sans-serif\" font-size=\"$size\" font-weight=\"${if (bold) 700 else 400}\" fill=\"$color\"$extra>${escape(value)}</text>\n"

    private fun line(
        start: Point,
        end: Point,
        x: (Double) -> Double,
        y: (Double) -> Double,
        attributes: String = "",
    ) = "<line x1=\"${number(x(start.x))}\" y1=\"${number(y(start.y))}\" x2=\"${number(x(end.x))}\" y2=\"${number(y(end.y))}\"${if (attributes.isEmpty()) "" else " $attributes"}/>\n"

    private fun photoMime(bytes: ByteArray) = when {
        bytes.size >= 4 && bytes[0] == 0x89.toByte() && bytes[1] == 0x50.toByte() -> "image/png"
        bytes.size >= 4 && bytes.copyOfRange(0, 4).decodeToString() == "GIF8" -> "image/gif"
        bytes.size >= 12 && bytes.copyOfRange(0, 4).decodeToString() == "RIFF" -> "image/webp"
        else -> "image/jpeg"
    }

    private fun number(value: Double) = String.format(Locale.US, "%.2f", value)
    private fun escape(value: String) = value.replace("&", "&amp;").replace("<", "&lt;")
        .replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&apos;")
}
