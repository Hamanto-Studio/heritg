import SwiftUI

struct HeritgTreeCanvas: View {
    let layout: TreeLayoutResult
    let focusedPersonID: String?
    @Binding var generationLimits: TreeGenerationLimits
    let availableGenerationLevels: TreeAvailableGenerationLevels
    let onSelectPerson: (String, String) -> Void
    let onDeselectPerson: () -> Void
    let onAddRelative: (String) -> Void
    let onCreateFirstPerson: () -> Void
    let onShowTrees: () -> Void
    let onShowPeople: () -> Void
    let onShowSettings: () -> Void
    let onEditPerson: (String, String) -> Void

    @State private var offset: CGSize = .zero
    @State private var scale: CGFloat = 1
    @State private var canvasSize: CGSize = .zero
    @State private var showsAddControls = true
    @GestureState private var drag: CGSize = .zero
    @GestureState private var zoomState = TreeZoomGestureState()

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                HeritgColor.treeCanvas.ignoresSafeArea()

                if layout.nodes.isEmpty {
                    emptyCanvas
                    emptyControls
                } else {
                    tree(in: proxy.size)
                    if showsAddControls {
                        controls
                    }
                }
            }
            .onChange(of: proxy.size, initial: true) { _, size in
                canvasSize = size
                fitTree(in: size)
            }
        }
        .overlay(alignment: .bottomLeading) {
            if !layout.nodes.isEmpty {
                toggleControlsButton
                    .padding(16)
            }
        }
        .onChange(of: layout) {
            guard focusedPersonID != nil else { return }
            fitTree(in: canvasSize)
        }
        .onChange(of: focusedPersonID) { _, newFocusedPersonID in
            guard newFocusedPersonID != nil else { return }
            withAnimation(.smooth(duration: 0.28)) {
                fitTree(in: canvasSize, minimumScale: 0.9)
            }
        }
    }

    private var emptyCanvas: some View {
        Button(action: onCreateFirstPerson) {
            Label("Add first person", systemImage: "person.badge.plus")
        }
        .buttonStyle(HeritgButtonStyle(variant: .primary))
        .accessibilityLabel("Add the first person")
        .accessibilityHint("Starts your family tree")
        .accessibilityIdentifier("tree.createFirstPerson")
    }

    private var emptyControls: some View {
        VStack {
            HStack {
                familyTreesButton
                Spacer()
                Button("Settings", systemImage: "gearshape", action: onShowSettings)
                    .labelStyle(.iconOnly)
                    .buttonStyle(HeritgIconButtonStyle())
                    .accessibilityLabel("Settings")
                    .accessibilityIdentifier("tree.settings")
            }
            Spacer()
        }
        .padding(16)
    }

    private func tree(in size: CGSize) -> some View {
        let center = CGPoint(x: size.width / 2, y: size.height / 2)
        let connectionPlan = TreeConnectionPlan.make(
            from: layout,
            showsRelationshipLabels: focusedPersonID != nil
        )
        let drawingBounds = connectionPlan.drawingBounds(including: layout.nodes)
        let drawingOrigin = CGPoint(x: drawingBounds.minX, y: drawingBounds.minY)
        let renderOffset = CGSize(
            width: offset.width + drag.width,
            height: offset.height + drag.height
        )
        let gestureMagnification = ((scale * zoomState.magnification).clamped(to: 0.2...1.8)) / scale

        return ZStack {
            Color.clear
                .contentShape(Rectangle())
                .onTapGesture { onDeselectPerson() }

            ZStack {
                Canvas { context, _ in
                    for family in connectionPlan.families {
                        let path = TreeConnector.path(for: family.segments) {
                            localPoint($0, drawingOrigin: drawingOrigin)
                        }
                        context.stroke(
                            path,
                            with: .color(HeritgColor.line),
                            style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round)
                        )

                        for point in family.junctions {
                            let junction = localPoint(point, drawingOrigin: drawingOrigin)
                            context.fill(
                                Path(ellipseIn: CGRect(
                                    x: junction.x - 2,
                                    y: junction.y - 2,
                                    width: 4,
                                    height: 4
                                )),
                                with: .color(HeritgColor.line)
                            )
                        }
                    }

                    for edge in connectionPlan.nonParentEdges {
                        let relationshipPath = TreeConnector.path(
                            kind: edge.kind,
                            from: localPoint(edge.from, drawingOrigin: drawingOrigin),
                            to: localPoint(edge.to, drawingOrigin: drawingOrigin),
                            avatarRadius: TreeVisualMetrics.avatarRadius
                        )
                        context.stroke(
                            relationshipPath,
                            with: .color(HeritgColor.line),
                            style: StrokeStyle(lineWidth: 1.5, lineCap: .round, lineJoin: .round)
                        )
                    }

                    for point in connectionPlan.crossings {
                        let crossing = localPoint(point, drawingOrigin: drawingOrigin)
                        context.fill(
                            Path(ellipseIn: CGRect(
                                x: crossing.x - 4,
                                y: crossing.y - 4,
                                width: 8,
                                height: 8
                            )),
                            with: .color(HeritgColor.treeCanvas)
                        )
                        let bridge = Path { path in
                            path.move(to: CGPoint(x: crossing.x, y: crossing.y - 5))
                            path.addLine(to: CGPoint(x: crossing.x, y: crossing.y + 5))
                        }
                        context.stroke(
                            bridge,
                            with: .color(HeritgColor.line),
                            style: StrokeStyle(lineWidth: 1.5, lineCap: .round)
                        )
                    }
                }
                .frame(width: drawingBounds.width, height: drawingBounds.height)
                .allowsHitTesting(false)

                ForEach(connectionPlan.nonParentEdges.filter { $0.kind == .partner }) { edge in
                    relationshipEdgeLabel(for: edge)
                        .position(
                            x: (localPoint(edge.from, drawingOrigin: drawingOrigin).x +
                                localPoint(edge.to, drawingOrigin: drawingOrigin).x) / 2,
                            y: (localPoint(edge.from, drawingOrigin: drawingOrigin).y +
                                localPoint(edge.to, drawingOrigin: drawingOrigin).y) / 2 - 12
                        )
                        .allowsHitTesting(false)
                }

                ForEach(layout.nodes) { node in
                    personNode(
                        node,
                        anchor: localPoint(node.position, drawingOrigin: drawingOrigin)
                    )
                }
            }
            .frame(width: drawingBounds.width, height: drawingBounds.height)
            .position(
                x: center.x + drawingBounds.midX,
                y: center.y + drawingBounds.midY
            )
            .scaleEffect(scale, anchor: .center)
            .offset(renderOffset)
            .scaleEffect(gestureMagnification, anchor: zoomState.anchor)
        }
        .frame(width: size.width, height: size.height)
        .contentShape(Rectangle())
        .gesture(panGesture)
        .simultaneousGesture(zoomGesture)
    }

    private func localPoint(_ point: CGPoint, drawingOrigin: CGPoint) -> CGPoint {
        CGPoint(x: point.x - drawingOrigin.x, y: point.y - drawingOrigin.y)
    }

    private func personNode(
        _ node: TreeNodeLayout,
        anchor: CGPoint
    ) -> some View {
        let showsRelationship = focusedPersonID != nil
        let showsLifeSummary = node.person.lifeSummary != nil
        let role = node.id == focusedPersonID
            ? String(
                localized: "You",
                bundle: AppLanguage.selectedBundle,
                locale: AppLanguage.selectedLocale
            )
            : node.role
        let labelHeight = TreeVisualMetrics.nodeLabelHeight(
            showsRelationship: showsRelationship,
            showsLifeSummary: showsLifeSummary
        )

        return ZStack {
            Button {
                onSelectPerson(node.person.id, role)
            } label: {
                Circle()
                    .fill(HeritgColor.base)
                    .frame(
                        width: TreeVisualMetrics.avatarDiameter,
                        height: TreeVisualMetrics.avatarDiameter
                    )
                    .overlay {
                        ProfilePhotoAvatar(
                            data: node.person.profilePhotoData,
                            initials: node.person.name.prefix(1).uppercased(),
                            size: TreeVisualMetrics.avatarDiameter - 10,
                            background: node.id == focusedPersonID
                                ? HeritgColor.brand.opacity(0.12)
                                : HeritgColor.recessed
                        )
                    }
                    .overlay {
                        Circle()
                            .stroke(
                                node.id == focusedPersonID ? HeritgColor.brand : HeritgColor.line,
                                lineWidth: node.id == focusedPersonID ? 2 : 1
                            )
                    }
                    .shadow(color: .black.opacity(0.06), radius: 5, y: 2)
            }
            .buttonStyle(.plain)
            .position(anchor)
            .accessibilityLabel(node.person.name)
            .accessibilityValue(focusedPersonID == nil ? "" : role)
            .accessibilityHint("Selects this person")
            .accessibilityIdentifier("person.node.\(node.person.id)")

            VStack(spacing: 2) {
                Text(node.person.name)
                    .font(.callout.bold())
                    .foregroundStyle(HeritgColor.text)
                    .lineLimit(1)
                    .minimumScaleFactor(0.55)
                    .multilineTextAlignment(.center)
                if showsRelationship {
                    Text(role)
                        .font(.caption)
                        .foregroundStyle(HeritgColor.subtleText)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
                if let lifeSummary = node.person.lifeSummary {
                    Text(lifeSummary)
                        .font(.caption2)
                        .foregroundStyle(HeritgColor.subtleText)
                        .lineLimit(1)
                }
            }
            .frame(
                width: TreeVisualMetrics.nodeLabelWidth,
                height: labelHeight,
                alignment: .top
            )
            .position(
                x: anchor.x,
                y: anchor.y + TreeVisualMetrics.nodeLabelCenterOffset(
                    showsRelationship: showsRelationship,
                    showsLifeSummary: showsLifeSummary
                )
            )
            .accessibilityHidden(true)

            let addSide = TreeVisualMetrics.addControlSide(
                avoiding: occupiedSides(for: node),
                preferredHorizontalSide: node.position.x <= 0 ? .left : .right
            )
            let addPosition = TreeVisualMetrics.addControlPosition(
                avatarCenter: anchor,
                scale: 1,
                side: addSide
            )

            if showsAddControls {
                Button("Add relative to \(node.person.name)", systemImage: "plus") {
                    onAddRelative(node.person.id)
                }
                .labelStyle(.iconOnly)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(.white)
                .frame(
                    width: TreeVisualMetrics.minimumTapTarget,
                    height: TreeVisualMetrics.minimumTapTarget
                )
                .background {
                    Circle()
                        .fill(HeritgColor.add)
                        .frame(width: 24, height: 24)
                }
                .contentShape(Circle())
                .position(addPosition)
                .accessibilityLabel("Add relative to \(node.person.name)")
                .accessibilityIdentifier("person.add.\(node.person.id)")
            }

            if showsAddControls, node.id == focusedPersonID {
                Button("Edit \(node.person.name)", systemImage: "pencil") {
                    onEditPerson(node.person.id, role)
                }
                .labelStyle(.iconOnly)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(.white)
                .frame(
                    width: TreeVisualMetrics.minimumTapTarget,
                    height: TreeVisualMetrics.minimumTapTarget
                )
                .background {
                    Circle()
                        .fill(HeritgColor.brand)
                        .frame(width: 24, height: 24)
                }
                .contentShape(Circle())
                .position(
                    TreeVisualMetrics.adjacentControlPosition(
                        to: addPosition,
                        scale: 1,
                        side: addSide
                    )
                )
                .accessibilityLabel("Edit \(node.person.name)")
                .accessibilityIdentifier("person.edit.\(node.person.id)")
            }
        }
    }

    private func relationshipEdgeLabel(for edge: TreeEdgeLayout) -> some View {
        Text(edge.marriageLabel ?? "")
            .font(.caption2.weight(.medium))
            .foregroundStyle(HeritgColor.subtleText)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(HeritgColor.treeCanvas)
            .clipShape(Capsule())
            .accessibilityLabel(edge.marriageLabel ?? "")
    }

    private func occupiedSides(for node: TreeNodeLayout) -> Set<TreeNodeSide> {
        layout.edges.reduce(into: []) { sides, edge in
            let otherPosition: CGPoint
            if edge.from == node.position {
                otherPosition = edge.to
            } else if edge.to == node.position {
                otherPosition = edge.from
            } else {
                return
            }

            switch edge.kind {
            case .parent:
                sides.insert(otherPosition.y < node.position.y ? .top : .bottom)
            case .partner, .sibling:
                sides.insert(otherPosition.x < node.position.x ? .left : .right)
            }
        }
    }

    private var controls: some View {
        TreeCanvasControls(
            generationLimits: $generationLimits,
            availableGenerationLevels: availableGenerationLevels,
            onShowTrees: onShowTrees,
            onShowPeople: onShowPeople,
            onShowSettings: onShowSettings,
            onZoomIn: zoomIn,
            onZoomOut: zoomOut,
            onShowAll: {
                fitTree(in: canvasSize, minimumScale: 0.2, centerOnFocusedPerson: false)
            }
        )
    }

    private var familyTreesButton: some View {
        Button(action: onShowTrees) {
            Image(systemName: "sidebar.left")
        }
            .buttonStyle(HeritgIconButtonStyle())
            .accessibilityLabel("Family Trees")
            .accessibilityHint("Opens your family tree library")
            .accessibilityIdentifier("tree.library")
    }

    private var toggleControlsButton: some View {
        Button(
            controlsButtonLabel,
            systemImage: showsAddControls ? "eye" : "eye.slash"
        ) {
            showsAddControls.toggle()
        }
        .labelStyle(.iconOnly)
        .buttonStyle(HeritgIconButtonStyle())
        .accessibilityLabel(controlsButtonLabel)
        .accessibilityValue(controlsButtonValue)
        .accessibilityIdentifier("tree.toggleControls")
    }

    private var controlsButtonLabel: String {
        showsAddControls
            ? String(
                localized: "Hide controls",
                bundle: AppLanguage.selectedBundle,
                locale: AppLanguage.selectedLocale
            )
            : String(
                localized: "Show controls",
                bundle: AppLanguage.selectedBundle,
                locale: AppLanguage.selectedLocale
            )
    }

    private var controlsButtonValue: String {
        showsAddControls
            ? String(
                localized: "Shown",
                bundle: AppLanguage.selectedBundle,
                locale: AppLanguage.selectedLocale
            )
            : String(
                localized: "Hidden",
                bundle: AppLanguage.selectedBundle,
                locale: AppLanguage.selectedLocale
            )
    }

    private var panGesture: some Gesture {
        DragGesture()
            .updating($drag) { value, state, _ in state = value.translation }
            .onEnded { value in
                offset.width += value.translation.width
                offset.height += value.translation.height
            }
    }

    private var zoomGesture: some Gesture {
        MagnifyGesture()
            .updating($zoomState) { value, state, _ in
                state.magnification = value.magnification
                state.anchor = value.startAnchor
            }
            .onEnded { value in
                commitZoom(magnification: value.magnification, anchor: value.startAnchor)
            }
    }

    private func zoomIn() {
        withAnimation(.smooth(duration: 0.22)) {
            setScalePreservingTreeCenter((scale * 1.25).clamped(to: 0.2...1.8))
        }
    }

    private func zoomOut() {
        withAnimation(.smooth(duration: 0.22)) {
            setScalePreservingTreeCenter((scale / 1.25).clamped(to: 0.2...1.8))
        }
    }

    private func commitZoom(magnification: CGFloat, anchor: UnitPoint) {
        guard scale > 0, canvasSize.width > 0, canvasSize.height > 0 else { return }
        let newScale = (scale * magnification).clamped(to: 0.2...1.8)
        let effectiveMagnification = newScale / scale
        offset = TreeViewportTransform.offset(
            afterMagnifying: offset,
            by: effectiveMagnification,
            around: CGPoint(x: anchor.x * canvasSize.width, y: anchor.y * canvasSize.height),
            viewportCenter: CGPoint(x: canvasSize.width / 2, y: canvasSize.height / 2)
        )
        scale = newScale
    }

    private func setScalePreservingTreeCenter(_ newScale: CGFloat) {
        guard canvasSize.width > 0, canvasSize.height > 0,
              let minX = layout.nodes.map(\.position.x).min(),
              let maxX = layout.nodes.map(\.position.x).max(),
              let minY = layout.nodes.map(\.position.y).min(),
              let maxY = layout.nodes.map(\.position.y).max() else {
            scale = newScale
            return
        }

        let treeCenter = CGPoint(x: (minX + maxX) / 2, y: (minY + maxY) / 2)
        let screenCenter = CGPoint(
            x: canvasSize.width / 2 + treeCenter.x * scale + offset.width,
            y: canvasSize.height / 2 + treeCenter.y * scale + offset.height
        )

        scale = newScale
        offset = CGSize(
            width: screenCenter.x - canvasSize.width / 2 - treeCenter.x * newScale,
            height: screenCenter.y - canvasSize.height / 2 - treeCenter.y * newScale
        )
    }

    private func fitTree(
        in size: CGSize,
        minimumScale: CGFloat = 0.72,
        centerOnFocusedPerson: Bool = true
    ) {
        guard size.width > 0, size.height > 0, !layout.nodes.isEmpty else { return }

        let xValues = layout.nodes.map(\.position.x)
        let yValues = layout.nodes.map(\.position.y)
        guard let minX = xValues.min(), let maxX = xValues.max(),
              let minY = yValues.min(), let maxY = yValues.max() else { return }

        let contentWidth = max(maxX - minX + 190, 190)
        let contentHeight = max(maxY - minY + 190, 190)
        let availableWidth = max(size.width - 64, 1)
        let availableHeight = max(size.height - 180, 1)
        scale = min(availableWidth / contentWidth, availableHeight / contentHeight)
            .clamped(to: minimumScale...1.25)

        let contentCenter = CGPoint(x: (minX + maxX) / 2, y: (minY + maxY) / 2)
        let targetCenter = centerOnFocusedPerson
            ? layout.nodes.first(where: { $0.id == focusedPersonID })?.position ?? contentCenter
            : contentCenter
        offset = CGSize(
            width: -targetCenter.x * scale,
            height: -targetCenter.y * scale
        )
    }
}

private struct TreeZoomGestureState {
    var magnification: CGFloat = 1
    var anchor: UnitPoint = .center
}

private extension Comparable {
    func clamped(to range: ClosedRange<Self>) -> Self {
        min(max(self, range.lowerBound), range.upperBound)
    }
}
