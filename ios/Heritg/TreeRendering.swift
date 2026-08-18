import SwiftUI

nonisolated enum TreeViewportTransform {
    static func offset(
        afterMagnifying currentOffset: CGSize,
        by magnification: CGFloat,
        around anchor: CGPoint,
        viewportCenter: CGPoint
    ) -> CGSize {
        let anchorFromCenter = CGSize(
            width: anchor.x - viewportCenter.x,
            height: anchor.y - viewportCenter.y
        )
        return CGSize(
            width: currentOffset.width * magnification
                + anchorFromCenter.width * (1 - magnification),
            height: currentOffset.height * magnification
                + anchorFromCenter.height * (1 - magnification)
        )
    }

    static func canvasTransform(
        contentSize: CGSize,
        viewportSize: CGSize,
        scale: CGFloat,
        offset: CGSize
    ) -> CGAffineTransform {
        CGAffineTransform(
            a: scale,
            b: 0,
            c: 0,
            d: scale,
            tx: viewportSize.width / 2 + offset.width - contentSize.width * scale / 2,
            ty: viewportSize.height / 2 + offset.height - contentSize.height * scale / 2
        )
    }

    static func project(
        _ point: CGPoint,
        from contentBounds: CGRect,
        into viewportSize: CGSize,
        scale: CGFloat,
        offset: CGSize
    ) -> CGPoint {
        CGPoint(
            x: point.x - contentBounds.minX,
            y: point.y - contentBounds.minY
        ).applying(canvasTransform(
            contentSize: contentBounds.size,
            viewportSize: viewportSize,
            scale: scale,
            offset: offset
        ))
    }
}

nonisolated enum TreeVisualMetrics {
    static let overviewEnterScale: CGFloat = 0.3
    static let overviewExitScale: CGFloat = 0.42
    static let minimumTapTarget: CGFloat = 44
    static let avatarDiameter: CGFloat = 64
    static let avatarRadius = avatarDiameter / 2
    static let horizontalSpacing: CGFloat = 260
    static let familyGap: CGFloat = 200
    static let generationSpacing: CGFloat = 260
    static let labelOffset: CGFloat = 66
    static let labelHeight: CGFloat = 72
    static let nodeLabelWidth: CGFloat = 190
    static let nodeLabelTopSpacing: CGFloat = 10

    static func compactName(_ value: String) -> String {
        let normalized = value.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        let fallback = normalized.isEmpty ? "Unnamed person" : normalized
        let units = Array(fallback.utf16)
        guard units.count > 34 else { return fallback }
        let prefix = String(decoding: units.prefix(31), as: UTF16.self)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return "\(prefix)..."
    }

    static func nameFontSize(_ value: String) -> CGFloat {
        CGFloat(max(9, min(16, 320 / max(20, value.utf16.count))))
    }

    static func shouldRenderOverview(currentlyOverview: Bool, scale: CGFloat) -> Bool {
        currentlyOverview ? scale < overviewExitScale : scale < overviewEnterScale
    }

    static func actionCompensation(at scale: CGFloat) -> CGFloat {
        let safeScale = max(scale, 0.001)
        return actionLayoutScale(at: safeScale) / safeScale
    }

    static func actionVisualScale(at scale: CGFloat) -> CGFloat {
        min(1, max(scale, 0.001))
    }

    static func actionDistance(index: CGFloat, at scale: CGFloat) -> CGFloat {
        avatarRadius + 12
            + (22 + index * (minimumTapTarget + 4)) * actionCompensation(at: scale)
    }

    static func actionHitTarget(at scale: CGFloat) -> CGFloat {
        minimumTapTarget * actionLayoutScale(at: scale)
    }

    private static func actionLayoutScale(at scale: CGFloat) -> CGFloat {
        min(1, max(0.5, scale))
    }

    static func connectorWidth(at scale: CGFloat) -> CGFloat {
        max(TreeConnectorStyle.width * scale, 0.75)
    }

    static func connectorDash(at scale: CGFloat) -> [CGFloat] {
        let visibleScale = max(scale, 0.25)
        return TreeConnectorStyle.siblingDash.map { $0 * visibleScale }
    }

    static func nodeLabelHeight(showsRelationship: Bool, showsLifeSummary: Bool) -> CGFloat {
        var height: CGFloat = 20
        if showsRelationship { height += 20 }
        if showsLifeSummary { height += 16 }
        return height
    }

    static func nodeLabelCenterOffset(showsRelationship: Bool, showsLifeSummary: Bool) -> CGFloat {
        avatarRadius + nodeLabelTopSpacing
            + nodeLabelHeight(
                showsRelationship: showsRelationship,
                showsLifeSummary: showsLifeSummary
            ) / 2
    }

    static func nodeLabelBottomOffset(showsRelationship: Bool, showsLifeSummary: Bool) -> CGFloat {
        avatarRadius + nodeLabelTopSpacing
            + nodeLabelHeight(
                showsRelationship: showsRelationship,
                showsLifeSummary: showsLifeSummary
            )
    }

}

nonisolated enum TreeConnector {
    struct FamilyGeometry: Equatable, Sendable {
        let parentJoinY: CGFloat
        let childRailY: CGFloat
        let trunkX: CGFloat
        let parentRange: ClosedRange<CGFloat>
        let childRange: ClosedRange<CGFloat>
    }

    struct Segment: Equatable, Sendable {
        enum Orientation {
            case horizontal
            case vertical
        }

        let start: CGPoint
        let end: CGPoint

        var orientation: Orientation? {
            if abs(start.y - end.y) < TreeRoutingGeometry.epsilon,
               abs(start.x - end.x) >= TreeRoutingGeometry.epsilon { return .horizontal }
            if abs(start.x - end.x) < TreeRoutingGeometry.epsilon,
               abs(start.y - end.y) >= TreeRoutingGeometry.epsilon { return .vertical }
            return nil
        }

        var length: CGFloat {
            abs(end.x - start.x) + abs(end.y - start.y)
        }
    }

    static func laneIndices(for intervals: [ClosedRange<CGFloat>], clearance: CGFloat) -> [Int] {
        var laneEnds = [CGFloat]()

        return intervals.map { interval in
            if let lane = laneEnds.firstIndex(where: { $0 + clearance < interval.lowerBound }) {
                laneEnds[lane] = interval.upperBound
                return lane
            }
            laneEnds.append(interval.upperBound)
            return laneEnds.count - 1
        }
    }

    static func parentFamilyPath(
        parents: [CGPoint],
        child: CGPoint,
        avatarRadius: CGFloat,
        scale: CGFloat
    ) -> Path {
        familyPath(
            parentSources: parents,
            parents: parents,
            children: [child],
            avatarRadius: avatarRadius,
            scale: scale
        )
    }

    static func familyPath(
        parentSources: [CGPoint]? = nil,
        parents: [CGPoint],
        children: [CGPoint],
        avatarRadius: CGFloat,
        scale: CGFloat,
        branchOffset: CGFloat = 0
    ) -> Path {
        guard let geometry = familyGeometry(
            parents: parents,
            children: children,
            avatarRadius: avatarRadius,
            scale: scale,
            branchOffset: branchOffset
        ) else { return Path() }

        return path(for: familySegments(
            parentSources: parentSources,
            parents: parents,
            children: children,
            avatarRadius: avatarRadius,
            scale: scale,
            geometry: geometry
        ))
    }

    static func familySegments(
        parentSources: [CGPoint]? = nil,
        parentLabelBottoms: [CGFloat]? = nil,
        parents: [CGPoint],
        children: [CGPoint],
        avatarRadius: CGFloat,
        scale: CGFloat,
        geometry: FamilyGeometry
    ) -> [Segment] {
        let defaultParentLabelBottom = TreeVisualMetrics.labelOffset * scale
            + TreeVisualMetrics.labelHeight * scale / 2
            + 2 * scale
        let sources = parentSources?.count == parents.count ? parentSources! : parents
        let labelBottoms = parentLabelBottoms?.count == parents.count
            ? parentLabelBottoms!
            : Array(repeating: defaultParentLabelBottom, count: parents.count)
        var segments = parents.indices.map { index in
            Segment(
                start: CGPoint(
                    x: parents[index].x,
                    y: sources[index].y + labelBottoms[index]
                ),
                end: CGPoint(x: parents[index].x, y: geometry.parentJoinY)
            )
        }
        segments += [
            Segment(
                start: CGPoint(x: geometry.parentRange.lowerBound, y: geometry.parentJoinY),
                end: CGPoint(x: geometry.parentRange.upperBound, y: geometry.parentJoinY)
            ),
            Segment(
                start: CGPoint(x: geometry.trunkX, y: geometry.parentJoinY),
                end: CGPoint(x: geometry.trunkX, y: geometry.childRailY)
            ),
            Segment(
                start: CGPoint(x: geometry.childRange.lowerBound, y: geometry.childRailY),
                end: CGPoint(x: geometry.childRange.upperBound, y: geometry.childRailY)
            ),
        ]
        segments += children.map { child in
            Segment(
                start: CGPoint(x: child.x, y: geometry.childRailY),
                end: CGPoint(x: child.x, y: child.y - avatarRadius)
            )
        }
        return segments.filter { $0.orientation != nil }
    }

    static func path(
        for segments: [Segment],
        transform: (CGPoint) -> CGPoint = { $0 }
    ) -> Path {
        var result = Path()
        for connectorPath in TreeConnectorStyle.connectorPaths(for: segments) {
            result.addPath(TreeConnectorStyle.roundedPath(
                for: connectorPath.points,
                transform: transform
            ))
        }
        return result
    }

    static func familyGeometry(
        parents: [CGPoint],
        children: [CGPoint],
        avatarRadius: CGFloat,
        scale: CGFloat,
        branchOffset: CGFloat = 0
    ) -> FamilyGeometry? {
        guard !parents.isEmpty, !children.isEmpty,
              let minParentX = parents.map(\.x).min(),
              let maxParentX = parents.map(\.x).max(),
              let minChildX = children.map(\.x).min(),
              let maxChildX = children.map(\.x).max() else { return nil }

        let parentLabelBottom = TreeVisualMetrics.labelOffset * scale
            + TreeVisualMetrics.labelHeight * scale / 2
            + 2 * scale
        let parentStartY = parents.map { $0.y + parentLabelBottom }.max() ?? 0
        let childTopY = children.map { $0.y - avatarRadius }.min() ?? 0
        let requestedJoinY = parentStartY + 12 * scale + branchOffset * 0.25
        let parentJoinY = min(
            max(requestedJoinY, parentStartY + 2 * scale),
            childTopY - 16 * scale
        )
        let minimumRailY = parentJoinY + 8 * scale
        let maximumRailY = childTopY - 8 * scale
        let requestedRailY = (parentStartY + childTopY) / 2 + branchOffset
        let childRailY = maximumRailY >= minimumRailY
            ? min(max(requestedRailY, minimumRailY), maximumRailY)
            : (parentStartY + childTopY) / 2
        let trunkX = parents.map(\.x).reduce(0, +) / CGFloat(parents.count)

        return FamilyGeometry(
            parentJoinY: parentJoinY,
            childRailY: childRailY,
            trunkX: trunkX,
            parentRange: minParentX...maxParentX,
            childRange: min(minChildX, trunkX)...max(maxChildX, trunkX)
        )
    }

    static func familyJunctionPoints(
        parents: [CGPoint],
        children: [CGPoint],
        avatarRadius: CGFloat,
        scale: CGFloat,
        branchOffset: CGFloat = 0
    ) -> [CGPoint] {
        guard let geometry = familyGeometry(
            parents: parents,
            children: children,
            avatarRadius: avatarRadius,
            scale: scale,
            branchOffset: branchOffset
        ) else { return [] }

        return [
            CGPoint(x: geometry.trunkX, y: geometry.parentJoinY),
            CGPoint(x: geometry.trunkX, y: geometry.childRailY),
        ]
    }

    static func familyBranchY(
        parents: [CGPoint],
        children: [CGPoint],
        avatarRadius: CGFloat,
        scale: CGFloat,
        branchOffset: CGFloat = 0
    ) -> CGFloat {
        familyGeometry(
            parents: parents,
            children: children,
            avatarRadius: avatarRadius,
            scale: scale,
            branchOffset: branchOffset
        )?.childRailY ?? 0
    }

    static func path(
        kind: RelationshipKind,
        from: CGPoint,
        to: CGPoint,
        avatarRadius: CGFloat
    ) -> Path {
        switch kind {
        case .parent:
            parentPath(from: from, to: to, avatarRadius: avatarRadius)
        case .partner, .sibling:
            horizontalPath(from: from, to: to, avatarRadius: avatarRadius)
        }
    }

    private static func parentPath(from: CGPoint, to: CGPoint, avatarRadius: CGFloat) -> Path {
        let parent = from.y <= to.y ? from : to
        let child = from.y <= to.y ? to : from
        let start = CGPoint(
            x: parent.x,
            y: parent.y + (TreeVisualMetrics.labelOffset + TreeVisualMetrics.labelHeight / 2)
                * avatarRadius / TreeVisualMetrics.avatarRadius
        )
        let end = CGPoint(x: child.x, y: child.y - avatarRadius)
        let midpointY = (start.y + end.y) / 2

        return Path { path in
            path.move(to: start)
            path.addLine(to: CGPoint(x: start.x, y: midpointY))
            path.addLine(to: CGPoint(x: end.x, y: midpointY))
            path.addLine(to: end)
        }
    }

    private static func horizontalPath(from: CGPoint, to: CGPoint, avatarRadius: CGFloat) -> Path {
        let left = from.x <= to.x ? from : to
        let right = from.x <= to.x ? to : from

        if left.x == right.x {
            return Path { path in
                path.move(to: left)
                path.addLine(to: right)
            }
        }

        return Path { path in
            path.move(to: CGPoint(x: left.x + avatarRadius, y: left.y))
            path.addLine(to: CGPoint(x: right.x - avatarRadius, y: right.y))
        }
    }
}
