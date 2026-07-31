package tech.robihamanto.heritg.android.core.interop

import tech.robihamanto.heritg.android.core.model.RelationshipKind
import tech.robihamanto.heritg.android.core.domain.semanticFormatter
import tech.robihamanto.heritg.android.core.tree.Point
import tech.robihamanto.heritg.android.core.tree.TreeConnectionPlan
import tech.robihamanto.heritg.android.core.tree.TreeEdgeLayout
import tech.robihamanto.heritg.android.core.tree.TreeLayoutResult
import tech.robihamanto.heritg.android.core.tree.TreeNodeLayout
import tech.robihamanto.heritg.android.core.tree.TreeVisualMetrics
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Base64
import java.util.Locale

object TreeSvgExporter {
    private const val FooterHeight = 56.0

    fun export(
        layout: TreeLayoutResult,
        relationshipLabels: Boolean,
        exportedAt: Instant = Instant.now(),
        locale: Locale = Locale.getDefault(),
    ): String {
        val plan = TreeConnectionPlan.make(layout, relationshipLabels)
        val bounds = plan.drawingBounds(layout.nodes)
        val height = bounds.height + FooterHeight
        fun x(value: Double) = value - bounds.minX
        fun y(value: Double) = value - bounds.minY
        return buildString {
            append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n")
            append("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"").append(number(bounds.width))
                .append("\" height=\"").append(number(height)).append("\" viewBox=\"0 0 ")
                .append(number(bounds.width)).append(' ').append(number(height)).append("\">\n")
            append("<rect width=\"100%\" height=\"100%\" fill=\"white\"/>\n")
            append("<g fill=\"none\" stroke=\"#8c8c8c\" stroke-opacity=\"0.45\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n")
            plan.families.flatMap { it.segments }.forEach { append(line(it.start, it.end, ::x, ::y)) }
            plan.nonParentEdges.forEach { edge ->
                val endpoints = nonParentEndpoints(edge)
                if (edge.kind == RelationshipKind.PARTNER) {
                    append(line(endpoints.first, endpoints.second, ::x, ::y))
                } else {
                    append("<path d=\"M ").append(number(x(endpoints.first.x))).append(' ')
                        .append(number(y(endpoints.first.y))).append(" Q ")
                        .append(number(x((endpoints.first.x + endpoints.second.x) / 2))).append(' ')
                        .append(number(y(endpoints.first.y - 16))).append(' ')
                        .append(number(x(endpoints.second.x))).append(' ').append(number(y(endpoints.second.y)))
                        .append("\"/>\n")
                }
            }
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
            layout.edges.forEach { edge -> edge.marriageLabel(semanticFormatter(locale))?.let { label ->
                val cx = x((edge.from.x + edge.to.x) / 2)
                val cy = y((edge.from.y + edge.to.y) / 2)
                val width = label.length * 7.0 + 14
                append("<rect x=\"").append(number(cx - width / 2)).append("\" y=\"")
                    .append(number(cy - 10)).append("\" width=\"").append(number(width))
                    .append("\" height=\"20\" rx=\"10\" fill=\"#ffffff\"/>\n")
                append(text(cx, cy + 4, label, 12, false, "#777777"))
            } }
            layout.nodes.forEachIndexed { index, node -> append(node(node, index, relationshipLabels, ::x, ::y)) }
            val zoned = exportedAt.atZone(ZoneId.systemDefault())
            val date = DateTimeFormatter.ofPattern("d MMM uuuu", locale).format(zoned)
            append(text(bounds.width - 28, bounds.height + 23, "© ${zoned.year} Hamanto Studio™", 14, true,
                "#666666", "end"))
            append(text(bounds.width - 28, bounds.height + 40, date, 11, false, "#666666", "end"))
            append("</svg>\n")
        }
    }

    private fun node(
        node: TreeNodeLayout,
        index: Int,
        showsRole: Boolean,
        x: (Double) -> Double,
        y: (Double) -> Double,
    ): String = buildString {
        val cx = x(node.position.x)
        val cy = y(node.position.y)
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
        append(fittedText(cx, baseline, node.person.name, 16, true, "#000000"))
        if (showsRole) {
            baseline += 20
            append(fittedText(cx, baseline, node.role, 13, false, "#777777"))
        }
        node.person.lifeSummary?.let {
            baseline += 16
            append(fittedText(cx, baseline, it, 11, false, "#777777"))
        }
    }

    private fun fittedText(x: Double, y: Double, value: String, size: Int, bold: Boolean, color: String): String {
        val extra = if (value.length * size * .55 > TreeVisualMetrics.NodeLabelWidth) {
            " textLength=\"${number(TreeVisualMetrics.NodeLabelWidth)}\" lengthAdjust=\"spacingAndGlyphs\""
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

    private fun nonParentEndpoints(edge: TreeEdgeLayout): Pair<Point, Point> {
        if (edge.from.x == edge.to.x) return edge.from to edge.to
        val left = if (edge.from.x < edge.to.x) edge.from else edge.to
        val right = if (edge.from.x < edge.to.x) edge.to else edge.from
        return Point(left.x + TreeVisualMetrics.AvatarRadius, left.y) to
            Point(right.x - TreeVisualMetrics.AvatarRadius, right.y)
    }

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
