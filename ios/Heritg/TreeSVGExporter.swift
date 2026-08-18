import CoreGraphics
import Foundation
import UIKit

struct TreeRasterExportSize: Equatable {
    static let targetScale: CGFloat = 3
    static let maximumDimension: CGFloat = 8_192
    static let maximumPixelCount: CGFloat = 24_000_000
    static let logicalFooterHeight: CGFloat = 56

    let size: CGSize
    let footerHeight: CGFloat
    let scale: CGFloat

    init(layout: TreeLayoutResult, showsRelationshipLabels: Bool) {
        let plan = TreeConnectionPlan.make(
            from: layout,
            showsRelationshipLabels: showsRelationshipLabels,
            controlsVisible: false,
            sourcePersonCount: layout.nodes.count
        )
        let bounds = plan.drawingBounds(including: layout.nodes)
        let logicalWidth = max(bounds.width, 1)
        let logicalHeight = max(bounds.height + Self.logicalFooterHeight, 1)
        let dimensionScale = Self.maximumDimension / max(logicalWidth, logicalHeight)
        let pixelScale = sqrt(Self.maximumPixelCount / (logicalWidth * logicalHeight))
        scale = min(Self.targetScale, dimensionScale, pixelScale)
        footerHeight = ceil(Self.logicalFooterHeight * scale)
        size = CGSize(
            width: ceil(logicalWidth * scale),
            height: ceil(bounds.height * scale) + footerHeight
        )
    }
}

enum TreeSVGExporter {
    static func data(
        layout: TreeLayoutResult,
        showsRelationshipLabels: Bool,
        exportedAt: Date,
        locale: Locale
    ) -> Data {
        let plan = TreeConnectionPlan.make(
            from: layout,
            showsRelationshipLabels: showsRelationshipLabels,
            controlsVisible: false,
            sourcePersonCount: layout.nodes.count
        )
        let bounds = plan.drawingBounds(including: layout.nodes)
        let footerHeight: CGFloat = 56
        let totalHeight = bounds.height + footerHeight
        var svg = """
        <?xml version="1.0" encoding="UTF-8"?>
        <svg xmlns="http://www.w3.org/2000/svg" width="\(number(bounds.width))" height="\(number(totalHeight))" viewBox="\(number(bounds.minX)) \(number(bounds.minY)) \(number(bounds.width)) \(number(totalHeight))">
        <rect x="\(number(bounds.minX))" y="\(number(bounds.minY))" width="\(number(bounds.width))" height="\(number(totalHeight))" fill="#ffffff"/>

        """

        let photoNodes = layout.nodes.enumerated().filter { $0.element.person.profilePhotoData != nil }
        if !photoNodes.isEmpty {
            svg += "<defs>\n"
            for (index, node) in photoNodes {
                svg += "<clipPath id=\"photo-\(index)\"><circle cx=\"\(number(node.position.x))\" cy=\"\(number(node.position.y))\" r=\"25\"/></clipPath>\n"
            }
            svg += "</defs>\n"
        }

        svg += "<g fill=\"none\" stroke=\"#8c8c8c\" stroke-opacity=\"0.45\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n"
        for family in plan.families {
            for segment in family.segments {
                svg += line(segment.start, segment.end)
            }
        }
        for route in plan.nonParentRoutes {
            for segment in route.segments {
                svg += line(segment.start, segment.end)
            }
        }
        svg += "</g>\n"

        for family in plan.families {
            for point in family.junctions {
                svg += "<circle cx=\"\(number(point.x))\" cy=\"\(number(point.y))\" r=\"2\" fill=\"#8c8c8c\" fill-opacity=\"0.45\"/>\n"
            }
        }
        for point in plan.crossings {
            svg += "<circle cx=\"\(number(point.x))\" cy=\"\(number(point.y))\" r=\"4\" fill=\"#ffffff\"/>\n"
            svg += line(
                CGPoint(x: point.x, y: point.y - 5),
                CGPoint(x: point.x, y: point.y + 5),
                attributes: "stroke=\"#8c8c8c\" stroke-opacity=\"0.45\" stroke-width=\"1.5\" stroke-linecap=\"round\""
            )
        }

        for route in plan.nonParentRoutes {
            guard let label = route.label else { continue }
            svg += "<rect x=\"\(number(label.rect.minX))\" y=\"\(number(label.rect.minY))\" width=\"\(number(label.rect.width))\" height=\"\(number(label.rect.height))\" rx=\"10\" fill=\"#ffffff\"/>\n"
            svg += text(
                label.text,
                x: label.center.x,
                y: label.center.y + 4,
                size: 12,
                color: "#777777"
            )
        }

        for (index, node) in layout.nodes.enumerated() {
            svg += nodeSVG(
                node,
                index: index,
                showsRelationshipLabels: showsRelationshipLabels
            )
        }

        let year = Calendar(identifier: .gregorian).component(.year, from: exportedAt)
        let date = exportedAt.formatted(
            .dateTime.locale(locale).day().month(.abbreviated).year()
        )
        let footerX = bounds.maxX - 28
        let footerY = bounds.maxY + 23
        svg += text(
            "© \(year) Hamanto Studio™",
            x: footerX,
            y: footerY,
            size: 14,
            color: "#666666",
            weight: 600,
            anchor: "end"
        )
        svg += text(date, x: footerX, y: footerY + 17, size: 11, color: "#666666", anchor: "end")
        svg += "</svg>\n"
        return Data(svg.utf8)
    }

    private static func nodeSVG(
        _ node: TreeNodeLayout,
        index: Int,
        showsRelationshipLabels: Bool
    ) -> String {
        let x = node.position.x
        let y = node.position.y
        var svg = "<circle cx=\"\(number(x))\" cy=\"\(number(y))\" r=\"32\" fill=\"#ffffff\" stroke=\"#a6a6a6\" stroke-opacity=\"0.35\" stroke-width=\"2\"/>\n"
        if let photo = node.person.profilePhotoData {
            svg += "<image x=\"\(number(x - 25))\" y=\"\(number(y - 25))\" width=\"50\" height=\"50\" href=\"data:\(mimeType(photo));base64,\(photo.base64EncodedString())\" preserveAspectRatio=\"xMidYMid slice\" clip-path=\"url(#photo-\(index))\"/>\n"
        } else {
            svg += "<circle cx=\"\(number(x))\" cy=\"\(number(y))\" r=\"25\" fill=\"#f2f5f7\"/>\n"
            let initial = String(node.person.name.prefix(1)).uppercased()
            svg += text(initial, x: x, y: y + 8, size: 24, color: "#000000", weight: 700)
        }

        var baseline = y + 58
        svg += fittedText(node.person.name, x: x, y: baseline, size: 16, weight: 700)
        if showsRelationshipLabels {
            baseline += 20
            svg += fittedText(node.role, x: x, y: baseline, size: 13, color: "#777777")
        }
        if let lifeSummary = node.person.lifeSummary {
            baseline += 16
            svg += fittedText(lifeSummary, x: x, y: baseline, size: 11, color: "#777777")
        }
        if let city = TreeVisualMetrics.formattedCity(node.person.city) {
            baseline += 16
            svg += fittedText(city, x: x, y: baseline, size: 11, color: "#777777")
        }
        return svg
    }

    private static func fittedText(
        _ value: String,
        x: CGFloat,
        y: CGFloat,
        size: CGFloat,
        color: String = "#000000",
        weight: Int = 400
    ) -> String {
        let width = textWidth(value, fontSize: size, weight: weight >= 600 ? .bold : .regular)
        let fitting = width > TreeVisualMetrics.nodeLabelWidth
            ? " textLength=\"\(number(TreeVisualMetrics.nodeLabelWidth))\" lengthAdjust=\"spacingAndGlyphs\""
            : ""
        return text(value, x: x, y: y, size: size, color: color, weight: weight, extra: fitting)
    }

    private static func text(
        _ value: String,
        x: CGFloat,
        y: CGFloat,
        size: CGFloat,
        color: String,
        weight: Int = 400,
        anchor: String = "middle",
        extra: String = ""
    ) -> String {
        "<text x=\"\(number(x))\" y=\"\(number(y))\" fill=\"\(color)\" font-family=\"-apple-system, BlinkMacSystemFont, sans-serif\" font-size=\"\(number(size))\" font-weight=\"\(weight)\" text-anchor=\"\(anchor)\"\(extra)>\(xmlEscaped(value))</text>\n"
    }

    private static func line(
        _ start: CGPoint,
        _ end: CGPoint,
        attributes: String? = nil
    ) -> String {
        let extra = attributes.map { " \($0)" } ?? ""
        return "<line x1=\"\(number(start.x))\" y1=\"\(number(start.y))\" x2=\"\(number(end.x))\" y2=\"\(number(end.y))\"\(extra)/>\n"
    }

    private static func textWidth(
        _ value: String,
        fontSize: CGFloat,
        weight: UIFont.Weight
    ) -> CGFloat {
        (value as NSString).size(withAttributes: [
            .font: UIFont.systemFont(ofSize: fontSize, weight: weight),
        ]).width
    }

    private static func mimeType(_ data: Data) -> String {
        if data.starts(with: [0x89, 0x50, 0x4E, 0x47]) { return "image/png" }
        if data.starts(with: [0x47, 0x49, 0x46, 0x38]) { return "image/gif" }
        return "image/jpeg"
    }

    private static func xmlEscaped(_ value: String) -> String {
        value
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
            .replacingOccurrences(of: "'", with: "&apos;")
    }

    private static func number(_ value: CGFloat) -> String {
        String(format: "%.2f", locale: Locale(identifier: "en_US_POSIX"), Double(value))
    }
}
