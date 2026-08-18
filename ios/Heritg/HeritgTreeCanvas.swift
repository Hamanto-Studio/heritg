import SwiftUI

struct HeritgTreeCanvas: View {
    let layout: TreeLayoutResult
    let sourcePersonCount: Int
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
    @State private var rendersOverview = false
    @State private var isPreparingConnectionPlan = false
    @State private var cachedConnectionPlan: CachedTreeConnectionPlan?
    @State private var connectionPlanTask: Task<Void, Never>?
    @State private var connectionPlanRequestID = UUID()
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
                    if isPreparingConnectionPlan {
                        ProgressView()
                            .padding(12)
                            .background(.regularMaterial, in: Circle())
                            .allowsHitTesting(false)
                    }
                }
            }
            .onAppear {
                canvasSize = proxy.size
                refreshConnectionPlan()
                fitTree(in: proxy.size)
            }
            .onChange(of: proxy.size) { size in
                canvasSize = size
                fitTree(in: size)
            }
            .onDisappear {
                connectionPlanTask?.cancel()
                connectionPlanTask = nil
            }
        }
        .overlay(alignment: .bottomLeading) {
            if !layout.nodes.isEmpty {
                toggleControlsButton
                    .padding(16)
            }
        }
        .onChange(of: layout) { _ in
            refreshConnectionPlan()
            guard focusedPersonID != nil else { return }
            fitTree(in: canvasSize)
        }
        .onChange(of: showsAddControls) { _ in
            refreshConnectionPlan()
        }
        .onChange(of: sourcePersonCount) { _ in
            refreshConnectionPlan()
        }
        .onChange(of: rendersOverview) { _ in
            refreshConnectionPlan()
        }
        .onChange(of: focusedPersonID) { newFocusedPersonID in
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
        let connectionDrawing = cachedConnectionPlan
        let drawingBounds = connectionDrawing?.drawingBounds ?? layout.nodes.reduce(into: CGRect.null) {
            $0 = $0.union(CGRect(
                x: $1.position.x - TreeVisualMetrics.nodeLabelWidth / 2,
                y: $1.position.y - TreeVisualMetrics.avatarRadius,
                width: TreeVisualMetrics.nodeLabelWidth,
                height: TreeVisualMetrics.avatarDiameter + TreeVisualMetrics.labelHeight
            ))
        }.insetBy(dx: -100, dy: -100)
        let drawingOrigin = connectionDrawing?.drawingOrigin ?? CGPoint(
            x: drawingBounds.minX,
            y: drawingBounds.minY
        )
        let renderOffset = CGSize(
            width: offset.width + drag.width,
            height: offset.height + drag.height
        )
        let effectiveScale = (scale * zoomState.magnification).clamped(to: 0.2...1.8)
        let gestureMagnification = effectiveScale / scale
        let overview = TreeVisualMetrics.shouldRenderOverview(
            currentlyOverview: rendersOverview,
            scale: effectiveScale
        )
        let actionCompensation = TreeVisualMetrics.actionCompensation(at: effectiveScale)

        return ZStack {
            Color.clear
                .contentShape(Rectangle())
                .onTapGesture { onDeselectPerson() }

            ZStack {
                Canvas { context, _ in
                    if let connectionDrawing {
                        for path in connectionDrawing.parentPaths {
                            context.stroke(
                                path,
                                with: .color(connectorColor(for: .parent)),
                                style: connectorStroke(for: .parent)
                            )
                        }

                        for connector in connectionDrawing.nonParentPaths {
                            context.stroke(
                                connector.path,
                                with: .color(connectorColor(for: connector.kind)),
                                style: connectorStroke(for: connector.kind)
                            )
                        }

                        for junction in connectionDrawing.junctions {
                            context.fill(
                                Path(ellipseIn: CGRect(
                                    x: junction.x - 2,
                                    y: junction.y - 2,
                                    width: 4,
                                    height: 4
                                )),
                                with: .color(connectorColor(for: .parent))
                            )
                        }

                        for plannedCrossing in connectionDrawing.crossings {
                            let crossing = plannedCrossing.point
                            context.fill(
                                Path(ellipseIn: CGRect(
                                    x: crossing.x - TreeConnectorStyle.crossingRadius,
                                    y: crossing.y - TreeConnectorStyle.crossingRadius,
                                    width: TreeConnectorStyle.crossingRadius * 2,
                                    height: TreeConnectorStyle.crossingRadius * 2
                                )),
                                with: .color(HeritgColor.treeCanvas)
                            )
                            let bridge = Path { path in
                                path.move(to: CGPoint(x: crossing.x, y: crossing.y - 6))
                                path.addLine(to: CGPoint(x: crossing.x, y: crossing.y + 6))
                            }
                            context.stroke(
                                bridge,
                                with: .color(connectorColor(for: plannedCrossing.kind)),
                                style: connectorStroke(for: plannedCrossing.kind)
                            )
                        }
                    }
                }
                .frame(width: drawingBounds.width, height: drawingBounds.height)
                .allowsHitTesting(false)

                if !overview, let connectionDrawing {
                    ForEach(connectionDrawing.relationshipLabels) { label in
                        relationshipEdgeLabel(label)
                            .position(label.center)
                            .allowsHitTesting(false)
                    }
                }

                ForEach(layout.nodes) { node in
                    personNode(
                        node,
                        anchor: localPoint(node.position, drawingOrigin: drawingOrigin),
                        overview: overview
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

            if let connectionDrawing {
                ForEach(layout.nodes) { node in
                    if let control = connectionDrawing.controlsByNodeID[node.id] {
                        actionControls(
                            for: node,
                            control: control,
                            overview: overview,
                            contentCenter: CGPoint(
                                x: center.x + drawingBounds.midX,
                                y: center.y + drawingBounds.midY
                            ),
                            drawingBounds: drawingBounds,
                            effectiveScale: effectiveScale,
                            gestureMagnification: gestureMagnification,
                            renderOffset: renderOffset,
                            actionCompensation: actionCompensation
                        )
                    }
                }
            }
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
        anchor: CGPoint,
        overview: Bool
    ) -> some View {
        let showsRelationship = focusedPersonID != nil
        let showsLifeSummary = node.person.lifeSummary != nil
        let role = roleLabel(for: node)
        let labelHeight = TreeVisualMetrics.nodeLabelHeight(
            showsRelationship: showsRelationship,
            showsLifeSummary: showsLifeSummary
        )

        return ZStack {
            Button {
                onSelectPerson(node.person.id, role)
            } label: {
                Circle()
                    .fill(node.id == focusedPersonID ? HeritgColor.selectedAvatar : HeritgColor.base)
                    .frame(
                        width: TreeVisualMetrics.avatarDiameter,
                        height: TreeVisualMetrics.avatarDiameter
                    )
                    .overlay {
                        if !overview {
                            ProfilePhotoAvatar(
                                data: node.person.profilePhotoData,
                                initials: node.person.name.prefix(1).uppercased(),
                                size: TreeVisualMetrics.avatarDiameter - 10,
                                background: node.id == focusedPersonID
                                    ? HeritgColor.selectedAvatar
                                    : HeritgColor.recessed
                            )
                        }
                    }
                    .overlay {
                        Circle()
                            .stroke(
                                node.id == focusedPersonID
                                    ? connectorColor(for: .parent)
                                    : HeritgColor.line,
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

            if !overview {
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
                            .foregroundStyle(
                                node.id == focusedPersonID
                                    ? connectorColor(for: .parent)
                                    : HeritgColor.subtleText
                            )
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
            }

        }
    }

    private func relationshipEdgeLabel(_ label: RenderedRelationshipLabel) -> some View {
        Text(label.text)
            .font(.caption2.weight(.medium))
            .foregroundStyle(HeritgColor.subtleText)
            .lineLimit(1)
            .frame(width: label.size.width, height: label.size.height)
            .background(HeritgColor.treeCanvas)
            .clipShape(Capsule())
            .accessibilityLabel(label.text)
    }

    private func showsActions(for node: TreeNodeLayout, overview: Bool) -> Bool {
        showsAddControls &&
            ((!overview && sourcePersonCount <= 24) || node.id == focusedPersonID)
    }

    @ViewBuilder
    private func actionControls(
        for node: TreeNodeLayout,
        control: RenderedTreeControl,
        overview: Bool,
        contentCenter: CGPoint,
        drawingBounds: CGRect,
        effectiveScale: CGFloat,
        gestureMagnification: CGFloat,
        renderOffset: CGSize,
        actionCompensation: CGFloat
    ) -> some View {
        if showsActions(for: node, overview: overview) {
            let visualScale = actionCompensation * effectiveScale
            let positionCompensation = max(
                actionCompensation,
                1 / max(effectiveScale, 0.001)
            )
            let addPosition = projectedActionPosition(
                node: node,
                side: control.side,
                index: 0,
                contentCenter: contentCenter,
                drawingBounds: drawingBounds,
                effectiveScale: effectiveScale,
                gestureMagnification: gestureMagnification,
                renderOffset: renderOffset,
                actionCompensation: positionCompensation
            )
            let editPosition = node.id == focusedPersonID
                ? projectedActionPosition(
                    node: node,
                    side: control.side,
                    index: 1,
                    contentCenter: contentCenter,
                    drawingBounds: drawingBounds,
                    effectiveScale: effectiveScale,
                    gestureMagnification: gestureMagnification,
                    renderOffset: renderOffset,
                    actionCompensation: positionCompensation
                )
                : nil
            let visiblePositions = visibleActionPositions(
                add: addPosition,
                edit: editPosition
            )
            Button("Add relative to \(node.person.name)", systemImage: "plus") {
                onAddRelative(node.person.id)
            }
            .labelStyle(.iconOnly)
            .font(.system(size: 16 * visualScale, weight: .bold))
            .foregroundStyle(.white)
            .frame(
                width: TreeVisualMetrics.minimumTapTarget,
                height: TreeVisualMetrics.minimumTapTarget
            )
            .background {
                Circle()
                    .fill(HeritgColor.add)
                    .frame(width: 28 * visualScale, height: 28 * visualScale)
            }
            .contentShape(Circle())
            .position(visiblePositions.add)
            .accessibilityLabel("Add relative to \(node.person.name)")
            .accessibilityIdentifier("person.add.\(node.person.id)")

            if node.id == focusedPersonID, let editPosition = visiblePositions.edit {
                Button("Edit \(node.person.name)", systemImage: "pencil") {
                    onEditPerson(node.person.id, roleLabel(for: node))
                }
                .labelStyle(.iconOnly)
                .font(.system(size: 14 * visualScale, weight: .bold))
                .foregroundStyle(.white)
                .frame(
                    width: TreeVisualMetrics.minimumTapTarget,
                    height: TreeVisualMetrics.minimumTapTarget
                )
                .background {
                    Circle()
                        .fill(HeritgColor.brand)
                        .frame(width: 28 * visualScale, height: 28 * visualScale)
                }
                .contentShape(Circle())
                .position(editPosition)
                .accessibilityLabel("Edit \(node.person.name)")
                .accessibilityIdentifier("person.edit.\(node.person.id)")
            }
        }
    }

    private func projectedActionPosition(
        node: TreeNodeLayout,
        side: TreeRoutingGeometry.ControlPlacement.Side,
        index: CGFloat,
        contentCenter: CGPoint,
        drawingBounds: CGRect,
        effectiveScale: CGFloat,
        gestureMagnification: CGFloat,
        renderOffset: CGSize,
        actionCompensation: CGFloat
    ) -> CGPoint {
        let logical = actionPosition(
            anchor: node.position,
            side: side,
            index: index,
            compensation: actionCompensation
        )
        return CGPoint(
            x: contentCenter.x + (logical.x - drawingBounds.midX) * effectiveScale +
                renderOffset.width * gestureMagnification,
            y: contentCenter.y + (logical.y - drawingBounds.midY) * effectiveScale +
                renderOffset.height * gestureMagnification
        )
    }

    private func visibleActionPositions(
        add: CGPoint,
        edit: CGPoint?
    ) -> (add: CGPoint, edit: CGPoint?) {
        let margin = TreeVisualMetrics.minimumTapTarget / 2
        let positions = [add, edit].compactMap { $0 }
        let minimumX = positions.map(\.x).min() ?? add.x
        let maximumX = positions.map(\.x).max() ?? add.x
        let horizontalShift: CGFloat
        if minimumX < margin {
            horizontalShift = margin - minimumX
        } else if maximumX > canvasSize.width - margin {
            horizontalShift = canvasSize.width - margin - maximumX
        } else {
            horizontalShift = 0
        }
        let visibleY = add.y.clamped(to: margin...max(margin, canvasSize.height - margin))
        let shift: (CGPoint) -> CGPoint = { point in
            CGPoint(x: point.x + horizontalShift, y: visibleY)
        }
        return (shift(add), edit.map(shift))
    }

    private func roleLabel(for node: TreeNodeLayout) -> String {
        node.id == focusedPersonID
            ? String(
                localized: "You",
                bundle: AppLanguage.selectedBundle,
                locale: AppLanguage.selectedLocale
            )
            : node.role
    }

    private func actionPosition(
        anchor: CGPoint,
        side: TreeRoutingGeometry.ControlPlacement.Side,
        index: CGFloat,
        compensation: CGFloat
    ) -> CGPoint {
        let direction: CGFloat = side == .left ? -1 : 1
        let distance = TreeVisualMetrics.avatarRadius + 12 +
            (22 + index * (TreeVisualMetrics.minimumTapTarget + 4)) * compensation
        return CGPoint(x: anchor.x + direction * distance, y: anchor.y)
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
        MagnificationGesture()
            .updating($zoomState) { value, state, _ in
                state.magnification = value
                state.anchor = .center
            }
            .onEnded { value in
                commitZoom(magnification: value, anchor: .center)
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
        updateOverview(for: newScale)
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
        updateOverview(for: newScale)
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
        let fittedScale = min(availableWidth / contentWidth, availableHeight / contentHeight)
            .clamped(to: minimumScale...1.25)
        scale = fittedScale
        updateOverview(for: fittedScale)

        let contentCenter = CGPoint(x: (minX + maxX) / 2, y: (minY + maxY) / 2)
        let targetCenter = centerOnFocusedPerson
            ? layout.nodes.first(where: { $0.id == focusedPersonID })?.position ?? contentCenter
            : contentCenter
        offset = CGSize(
            width: -targetCenter.x * scale,
            height: -targetCenter.y * scale
        )
    }

    private func refreshConnectionPlan() {
        connectionPlanTask?.cancel()
        cachedConnectionPlan = nil
        isPreparingConnectionPlan = true
        let requestedLayout = layout
        let requestedControlsVisible = showsAddControls && !rendersOverview
        let requestedSourcePersonCount = sourcePersonCount
        let requestID = UUID()
        connectionPlanRequestID = requestID
        connectionPlanTask = Task {
            let plan = await Task.detached(priority: .userInitiated) {
                TreeConnectionPlan.make(
                    from: requestedLayout,
                    showsRelationshipLabels: true,
                    controlsVisible: requestedControlsVisible,
                    sourcePersonCount: requestedSourcePersonCount
                )
            }.value
            guard !Task.isCancelled, requestID == connectionPlanRequestID else { return }
            cachedConnectionPlan = CachedTreeConnectionPlan(
                plan: plan,
                nodes: requestedLayout.nodes
            )
            isPreparingConnectionPlan = false
            connectionPlanTask = nil
        }
    }

    private func updateOverview(for newScale: CGFloat) {
        let next = TreeVisualMetrics.shouldRenderOverview(
            currentlyOverview: rendersOverview,
            scale: newScale
        )
        if next != rendersOverview { rendersOverview = next }
    }

    private func connectorColor(for kind: RelationshipKind) -> Color {
        switch kind {
        case .parent:
            Color(red: 156 / 255, green: 130 / 255, blue: 95 / 255)
        case .partner:
            Color(red: 180 / 255, green: 124 / 255, blue: 118 / 255)
        case .sibling:
            Color(red: 120 / 255, green: 149 / 255, blue: 108 / 255)
        }
    }

    private func connectorStroke(for kind: RelationshipKind) -> StrokeStyle {
        StrokeStyle(
            lineWidth: TreeConnectorStyle.width,
            lineCap: .round,
            lineJoin: .round,
            dash: kind == .sibling ? TreeConnectorStyle.siblingDash : []
        )
    }
}

private struct TreeZoomGestureState {
    var magnification: CGFloat = 1
    var anchor: UnitPoint = .center
}

private struct CachedTreeConnectionPlan {
    let plan: TreeConnectionPlan
    let drawingBounds: CGRect
    let drawingOrigin: CGPoint
    let parentPaths: [Path]
    let nonParentPaths: [StyledTreeConnectorPath]
    let junctions: [CGPoint]
    let crossings: [RenderedTreeCrossing]
    let relationshipLabels: [RenderedRelationshipLabel]
    let controlsByNodeID: [String: RenderedTreeControl]

    init(plan: TreeConnectionPlan, nodes: [TreeNodeLayout]) {
        self.plan = plan
        let bounds = plan.drawingBounds(including: nodes)
        let origin = CGPoint(x: bounds.minX, y: bounds.minY)
        drawingBounds = bounds
        drawingOrigin = origin

        func localPoint(_ point: CGPoint) -> CGPoint {
            CGPoint(
                x: point.x - origin.x,
                y: point.y - origin.y
            )
        }

        parentPaths = plan.families.flatMap { family in
            TreeConnectorStyle.connectorPaths(for: family.segments).map { connectorPath in
                TreeConnectorStyle.roundedPath(
                    for: connectorPath.points,
                    transform: localPoint
                )
            }
        }
        nonParentPaths = plan.nonParentRoutes.flatMap { route in
            TreeConnectorStyle.connectorPaths(for: route.segments).map { connectorPath in
                StyledTreeConnectorPath(
                    kind: route.relationship.kind,
                    path: TreeConnectorStyle.roundedPath(
                        for: connectorPath.points,
                        transform: localPoint
                    )
                )
            }
        }
        junctions = plan.families.flatMap(\.junctions).map(localPoint)
        crossings = plan.plannedCrossings.map {
            RenderedTreeCrossing(point: localPoint($0.point), kind: $0.kind)
        }
        relationshipLabels = plan.nonParentRoutes.compactMap { route in
            route.label.map {
                RenderedRelationshipLabel(
                    id: route.id,
                    text: $0.text,
                    center: localPoint($0.center),
                    size: $0.rect.size
                )
            }
        }
        controlsByNodeID = Dictionary(uniqueKeysWithValues: plan.controls.map {
            ($0.personID, RenderedTreeControl(side: $0.side))
        })
    }
}

private struct StyledTreeConnectorPath {
    let kind: RelationshipKind
    let path: Path
}

private struct RenderedTreeCrossing {
    let point: CGPoint
    let kind: RelationshipKind
}

private struct RenderedRelationshipLabel: Identifiable {
    let id: String
    let text: String
    let center: CGPoint
    let size: CGSize
}

private struct RenderedTreeControl {
    let side: TreeRoutingGeometry.ControlPlacement.Side
}

private extension Comparable {
    func clamped(to range: ClosedRange<Self>) -> Self {
        min(max(self, range.lowerBound), range.upperBound)
    }
}
