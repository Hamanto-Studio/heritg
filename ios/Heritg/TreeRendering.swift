import SwiftUI

enum TreeNodeSide: CaseIterable, Hashable {
    case right
    case left
    case top
    case bottom
    case topRight
    case topLeft
}

enum TreeViewportTransform {
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
}

enum TreeVisualMetrics {
    static let minimumTapTarget: CGFloat = 44
    static let avatarDiameter: CGFloat = 64
    static let avatarRadius = avatarDiameter / 2
    static let horizontalSpacing: CGFloat = 260
    static let generationSpacing: CGFloat = 260
    static let labelOffset: CGFloat = 66
    static let labelHeight: CGFloat = 72
    static let nodeLabelWidth: CGFloat = 190
    static let nodeLabelTopSpacing: CGFloat = 10

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

    static func addControlSide(
        avoiding occupiedSides: Set<TreeNodeSide>,
        preferredHorizontalSide: TreeNodeSide = .left
    ) -> TreeNodeSide {
        let oppositeHorizontalSide: TreeNodeSide = preferredHorizontalSide == .left ? .right : .left
        let outwardDiagonalSide: TreeNodeSide = preferredHorizontalSide == .left ? .topLeft : .topRight
        let preferredOrder = [
            preferredHorizontalSide,
            oppositeHorizontalSide,
            .top,
            .bottom,
            outwardDiagonalSide,
        ]

        return preferredOrder.first { !occupiedSides.contains($0) } ?? preferredHorizontalSide
    }

    static func addControlPosition(
        avatarCenter: CGPoint,
        scale: CGFloat,
        side: TreeNodeSide
    ) -> CGPoint {
        let offset = (avatarRadius + 34) * scale
        let bottomOffset = (labelOffset + labelHeight / 2 + 34) * scale

        switch side {
        case .right:
            return CGPoint(x: avatarCenter.x + offset, y: avatarCenter.y)
        case .left:
            return CGPoint(x: avatarCenter.x - offset, y: avatarCenter.y)
        case .top:
            return CGPoint(x: avatarCenter.x, y: avatarCenter.y - offset)
        case .bottom:
            return CGPoint(x: avatarCenter.x, y: avatarCenter.y + bottomOffset)
        case .topRight:
            return CGPoint(x: avatarCenter.x + offset, y: avatarCenter.y - offset)
        case .topLeft:
            return CGPoint(x: avatarCenter.x - offset, y: avatarCenter.y - offset)
        }
    }

    static func adjacentControlPosition(
        to controlPosition: CGPoint,
        scale: CGFloat,
        side: TreeNodeSide
    ) -> CGPoint {
        let spacing: CGFloat = 34 * scale

        switch side {
        case .right:
            return CGPoint(x: controlPosition.x + spacing, y: controlPosition.y)
        case .left:
            return CGPoint(x: controlPosition.x - spacing, y: controlPosition.y)
        case .top:
            return CGPoint(x: controlPosition.x, y: controlPosition.y - spacing)
        case .bottom:
            return CGPoint(x: controlPosition.x, y: controlPosition.y + spacing)
        case .topRight:
            return CGPoint(x: controlPosition.x + spacing, y: controlPosition.y - spacing)
        case .topLeft:
            return CGPoint(x: controlPosition.x - spacing, y: controlPosition.y - spacing)
        }
    }
}

enum TreeConnector {
    struct FamilyGeometry: Equatable {
        let parentJoinY: CGFloat
        let childRailY: CGFloat
        let trunkX: CGFloat
        let parentRange: ClosedRange<CGFloat>
        let childRange: ClosedRange<CGFloat>
    }

    struct Segment: Equatable {
        enum Orientation {
            case horizontal
            case vertical
        }

        let start: CGPoint
        let end: CGPoint

        var orientation: Orientation? {
            if start.y == end.y, start.x != end.x { return .horizontal }
            if start.x == end.x, start.y != end.y { return .vertical }
            return nil
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
        Path { path in
            for segment in segments {
                path.move(to: transform(segment.start))
                path.addLine(to: transform(segment.end))
            }
        }
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
