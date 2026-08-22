import CoreGraphics
import Foundation
import SwiftUI
import Testing
import UIKit
@testable import HERITG

@MainActor
struct TreeExportRoutingTests {
    @Test func svgUsesPlannedNonParentRouteAndLabelPosition() throws {
        let layout = obstacleLayout()
        let plan = TreeConnectionPlan.make(
            from: layout,
            showsRelationshipLabels: true,
            controlsVisible: false,
            sourcePersonCount: layout.nodes.count
        )
        let route = try #require(plan.nonParentRoutes.first)
        let label = try #require(route.label)
        let data = TreeSVGExporter.data(
            layout: layout,
            showsRelationshipLabels: true,
            exportedAt: Date(timeIntervalSince1970: 0),
            locale: Locale(identifier: "en")
        )
        let svg = try #require(String(data: data, encoding: .utf8))

        #expect(route.segments.count > 1)
        for path in TreeConnectorStyle.connectorPaths(for: route.segments) {
            #expect(svg.contains(TreeSVGExporter.connectorPathSVG(for: path.points)))
        }
        #expect(svg.contains(
            "<rect x=\"\(number(label.rect.minX))\" y=\"\(number(label.rect.minY))\" " +
                "width=\"\(number(label.rect.width))\" height=\"\(number(label.rect.height))\""
        ))
        #expect(svg.contains(
            "<text x=\"\(number(label.center.x))\" y=\"\(number(label.center.y + 4))\""
        ))
        #expect(!svg.contains(
            svgLine(TreeConnector.Segment(
                start: CGPoint(x: -228, y: 0),
                end: CGPoint(x: 228, y: 0)
            ))
        ))
    }

    @Test func rasterExportDrawsThePlannedDetour() throws {
        let layout = obstacleLayout()
        let plan = TreeConnectionPlan.make(
            from: layout,
            showsRelationshipLabels: true,
            controlsVisible: false,
            sourcePersonCount: layout.nodes.count
        )
        let route = try #require(plan.nonParentRoutes.first)
        let segment = try #require(route.segments
            .filter { $0.orientation == .horizontal && $0.length > 100 }
            .max(by: { $0.length < $1.length }))
        let logicalPoint = CGPoint(
            x: (segment.start.x + segment.end.x) / 2,
            y: segment.start.y
        )
        let size = CGSize(width: 1_000, height: 600)
        let renderer = ImageRenderer(content: TreeExportView(
            layout: layout,
            showsRelationshipLabels: true,
            exportedAt: Date(timeIntervalSince1970: 0),
            footerHeight: 0
        ).frame(width: size.width, height: size.height))
        renderer.scale = 1
        let image = try #require(renderer.uiImage?.cgImage)
        let outputPoint = transformed(
            logicalPoint,
            bounds: plan.drawingBounds(including: layout.nodes),
            size: size
        )

        #expect(hasNonWhitePixel(near: outputPoint, in: image))
    }

    @Test func svgRoundsOrdinaryElbowsButKeepsShortTerminalCornersSquare() {
        let rounded = TreeSVGExporter.connectorPathSVG(for: [
            CGPoint(x: 0, y: 0),
            CGPoint(x: 0, y: 60),
            CGPoint(x: 80, y: 60),
        ])
        let square = TreeSVGExporter.connectorPathSVG(for: [
            CGPoint(x: 0, y: 0),
            CGPoint(x: 80, y: 0),
            CGPoint(x: 80, y: 40),
        ])

        #expect(rounded.contains(" Q "))
        #expect(!square.contains(" Q "))
        #expect(square.contains("L 80.00 0.00 L 80.00 40.00"))
    }

    private func obstacleLayout() -> TreeLayoutResult {
        let positions = [
            "left": CGPoint(x: -260, y: 0),
            "middle": CGPoint(x: 0, y: 0),
            "right": CGPoint(x: 260, y: 0),
        ]
        let nodes = positions.keys.sorted().map { id in
            TreeNodeLayout(
                id: id,
                person: PersonSnapshot(id: id, name: id, gender: .unspecified),
                role: "Family member",
                position: positions[id]!
            )
        }
        let relationship = TreeEdgeLayout(
            id: "outer-partners",
            fromPersonID: "left",
            toPersonID: "right",
            from: positions["left"]!,
            to: positions["right"]!,
            kind: .partner,
            subtype: .spouse,
            marriageYear: "2004"
        )
        return TreeLayoutResult(nodes: nodes, edges: [relationship])
    }

    private func transformed(_ point: CGPoint, bounds: CGRect, size: CGSize) -> CGPoint {
        let scale = min(size.width / bounds.width, size.height / bounds.height)
        return CGPoint(
            x: size.width / 2 + (point.x - bounds.midX) * scale,
            y: size.height / 2 + (point.y - bounds.midY) * scale
        )
    }

    private func hasNonWhitePixel(near point: CGPoint, in image: CGImage) -> Bool {
        guard let data = image.dataProvider?.data,
              let bytes = CFDataGetBytePtr(data) else { return false }
        let x = Int(point.x.rounded())
        let y = Int(point.y.rounded())
        for sampleY in max(0, y - 2)...min(image.height - 1, y + 2) {
            for sampleX in max(0, x - 2)...min(image.width - 1, x + 2) {
                let offset = sampleY * image.bytesPerRow + sampleX * 4
                if bytes[offset] < 245 || bytes[offset + 1] < 245 || bytes[offset + 2] < 245 {
                    return true
                }
            }
        }
        return false
    }

    private func svgLine(_ segment: TreeConnector.Segment) -> String {
        "<line x1=\"\(number(segment.start.x))\" y1=\"\(number(segment.start.y))\" " +
            "x2=\"\(number(segment.end.x))\" y2=\"\(number(segment.end.y))\"/>"
    }

    private func number(_ value: CGFloat) -> String {
        String(format: "%.2f", locale: Locale(identifier: "en_US_POSIX"), Double(value))
    }
}
