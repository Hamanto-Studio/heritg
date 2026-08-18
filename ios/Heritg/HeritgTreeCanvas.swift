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
                connectionPlanRequestID = UUID()
            }
        }
        .overlay(alignment: .bottomLeading) {
            if !layout.nodes.isEmpty {
                toggleControlsButton
                    .padding(16)
            }
        }
        .onChange(of: connectionPlanFingerprint) { _ in
            refreshConnectionPlan()
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
        let fallbackBounds = drawingBounds(for: layout.nodes)
        let matchingConnectionPlan = cachedConnectionPlan?.fingerprint == connectionPlanFingerprint
            ? cachedConnectionPlan
            : nil
        let connectionDrawing = matchingConnectionPlan?.drawing ?? RenderedTreeConnectionDrawing(
            provisionalLayout: layout,
            bounds: fallbackBounds
        )
        let drawingBounds = connectionDrawing.drawingBounds
        let drawingOrigin = connectionDrawing.drawingOrigin
        let renderOffset = CGSize(
            width: offset.width + drag.width,
            height: offset.height + drag.height
        )
        let effectiveScale = (scale * zoomState.magnification).clamped(to: 0.08...1.8)
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

            connectionCanvas(
                connectionDrawing,
                viewportSize: size,
                effectiveScale: effectiveScale,
                projectedOffset: CGSize(
                    width: renderOffset.width * gestureMagnification,
                    height: renderOffset.height * gestureMagnification
                )
            )

            ZStack {
                if !overview {
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
            .position(x: center.x, y: center.y)
            .scaleEffect(scale, anchor: .center)
            .offset(renderOffset)
            .scaleEffect(gestureMagnification, anchor: zoomState.anchor)

            ForEach(layout.nodes) { node in
                let control = connectionDrawing.controlsByNodeID[node.id] ?? RenderedTreeControl(
                    side: node.position.x <= 0 ? .left : .right
                )
                actionControls(
                    for: node,
                    control: control,
                    overview: overview,
                    contentCenter: center,
                    viewportSize: size,
                    drawingBounds: drawingBounds,
                    effectiveScale: effectiveScale,
                    gestureMagnification: gestureMagnification,
                    renderOffset: renderOffset,
                    actionCompensation: actionCompensation
                )
            }
        }
        .frame(width: size.width, height: size.height)
        .contentShape(Rectangle())
        .gesture(panGesture)
        .simultaneousGesture(zoomGesture)
    }

    private func connectionCanvas(
        _ drawing: RenderedTreeConnectionDrawing,
        viewportSize: CGSize,
        effectiveScale: CGFloat,
        projectedOffset: CGSize
    ) -> some View {
        let transform = TreeViewportTransform.canvasTransform(
            contentSize: drawing.drawingBounds.size,
            viewportSize: viewportSize,
            scale: effectiveScale,
            offset: projectedOffset
        )
        let junctionRadius = max(TreeConnectorStyle.junctionRadius * effectiveScale, 1)
        let crossingRadius = max(TreeConnectorStyle.crossingRadius * effectiveScale, 2)

        return Canvas { context, _ in
            for path in drawing.parentPaths {
                context.stroke(
                    path.applying(transform),
                    with: .color(connectorColor(for: .parent)),
                    style: connectorStroke(for: .parent, scale: effectiveScale)
                )
            }

            for connector in drawing.nonParentPaths {
                context.stroke(
                    connector.path.applying(transform),
                    with: .color(connectorColor(for: connector.kind)),
                    style: connectorStroke(for: connector.kind, scale: effectiveScale)
                )
            }

            for localJunction in drawing.junctions {
                let junction = localJunction.applying(transform)
                context.fill(
                    Path(ellipseIn: CGRect(
                        x: junction.x - junctionRadius,
                        y: junction.y - junctionRadius,
                        width: junctionRadius * 2,
                        height: junctionRadius * 2
                    )),
                    with: .color(connectorColor(for: .parent))
                )
            }

            for plannedCrossing in drawing.crossings {
                let crossing = plannedCrossing.point.applying(transform)
                context.fill(
                    Path(ellipseIn: CGRect(
                        x: crossing.x - crossingRadius,
                        y: crossing.y - crossingRadius,
                        width: crossingRadius * 2,
                        height: crossingRadius * 2
                    )),
                    with: .color(HeritgColor.treeCanvas)
                )
                let bridgeHalfHeight = max(6 * effectiveScale, 2)
                let bridge = Path { path in
                    path.move(to: CGPoint(x: crossing.x, y: crossing.y - bridgeHalfHeight))
                    path.addLine(to: CGPoint(x: crossing.x, y: crossing.y + bridgeHalfHeight))
                }
                context.stroke(
                    bridge,
                    with: .color(connectorColor(for: plannedCrossing.kind)),
                    style: connectorStroke(for: plannedCrossing.kind, scale: effectiveScale)
                )
            }
        }
        .frame(width: viewportSize.width, height: viewportSize.height)
        .allowsHitTesting(false)
    }

    private func localPoint(_ point: CGPoint, drawingOrigin: CGPoint) -> CGPoint {
        CGPoint(x: point.x - drawingOrigin.x, y: point.y - drawingOrigin.y)
    }

    private func drawingBounds(for nodes: [TreeNodeLayout]) -> CGRect {
        nodes.reduce(into: CGRect.null) {
            $0 = $0.union(CGRect(
                x: $1.position.x - TreeVisualMetrics.nodeLabelWidth / 2,
                y: $1.position.y - TreeVisualMetrics.avatarRadius,
                width: TreeVisualMetrics.nodeLabelWidth,
                height: TreeVisualMetrics.avatarDiameter + TreeVisualMetrics.labelHeight
            ))
        }.insetBy(dx: -100, dy: -100)
    }

    private func personNode(
        _ node: TreeNodeLayout,
        anchor: CGPoint,
        overview: Bool
    ) -> some View {
        let showsRelationship = focusedPersonID != nil
        let showsLifeSummary = node.person.lifeSummary != nil
        let role = roleLabel(for: node)
        let displayName = TreeVisualMetrics.compactName(node.person.name)
        let avatarFill = avatarFill(for: node.person.gender)
        let avatarStroke = avatarStroke(for: node.person.gender)
        let labelHeight = TreeVisualMetrics.nodeLabelHeight(
            showsRelationship: showsRelationship,
            showsLifeSummary: showsLifeSummary
        )

        return ZStack {
            Button {
                onSelectPerson(node.person.id, role)
            } label: {
                Circle()
                    .fill(avatarFill)
                    .frame(
                        width: TreeVisualMetrics.avatarDiameter,
                        height: TreeVisualMetrics.avatarDiameter
                    )
                    .overlay {
                        if !overview {
                            ProfilePhotoAvatar(
                                data: node.person.profilePhotoData,
                                initials: displayName.prefix(1).uppercased(),
                                size: TreeVisualMetrics.avatarDiameter - 10,
                                background: avatarFill
                            )
                        }
                    }
                    .overlay {
                        Circle()
                            .stroke(
                                node.id == focusedPersonID
                                    ? connectorColor(for: .parent)
                                    : avatarStroke,
                                lineWidth: node.id == focusedPersonID ? 2 : 1
                            )
                    }
            }
            .buttonStyle(.plain)
            .position(anchor)
            .accessibilityLabel(node.person.name)
            .accessibilityValue(focusedPersonID == nil ? "" : role)
            .accessibilityHint("Selects this person")
            .accessibilityIdentifier("person.node.\(node.person.id)")

            if !overview, let birthOrder = node.birthOrder {
                ZStack {
                    Circle()
                        .fill(HeritgColor.treeCanvas)
                        .overlay {
                            Circle().stroke(avatarStroke, lineWidth: 2)
                        }
                    Text(verbatim: String(birthOrder))
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(HeritgColor.text)
                }
                .frame(width: 20, height: 20)
                .position(x: anchor.x - 23, y: anchor.y - 23)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
            }

            if !overview {
                VStack(spacing: 2) {
                    Text(verbatim: displayName)
                        .font(.system(size: TreeVisualMetrics.nameFontSize(displayName), weight: .bold))
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
        viewportSize: CGSize,
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
                edit: editPosition,
                viewportSize: viewportSize
            )
            positionedActionControl(at: visiblePositions.add, in: viewportSize) {
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
                .accessibilityLabel("Add relative to \(node.person.name)")
                .accessibilityIdentifier("person.add.\(node.person.id)")
            }

            if node.id == focusedPersonID, let editPosition = visiblePositions.edit {
                positionedActionControl(at: editPosition, in: viewportSize) {
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
                    .accessibilityLabel("Edit \(node.person.name)")
                    .accessibilityIdentifier("person.edit.\(node.person.id)")
                }
            }
        }
    }

    private func positionedActionControl<Content: View>(
        at position: CGPoint,
        in viewportSize: CGSize,
        @ViewBuilder content: () -> Content
    ) -> some View {
        TreeActionControlLayout(position: position) {
            content()
        }
        .frame(width: viewportSize.width, height: viewportSize.height)
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
        let projected = CGPoint(
            x: contentCenter.x + (logical.x - drawingBounds.midX) * effectiveScale +
                renderOffset.width * gestureMagnification,
            y: contentCenter.y + (logical.y - drawingBounds.midY) * effectiveScale +
                renderOffset.height * gestureMagnification
        )
        return projected
    }

    private func visibleActionPositions(
        add: CGPoint,
        edit: CGPoint?,
        viewportSize: CGSize
    ) -> (add: CGPoint, edit: CGPoint?) {
        let margin = TreeVisualMetrics.minimumTapTarget / 2
        let fallback = CGPoint(x: viewportSize.width / 2, y: viewportSize.height / 2)
        let visibleAdd = CGPoint(
            x: add.x.isFinite ? add.x : fallback.x,
            y: add.y.isFinite ? add.y : fallback.y
        )
        let visibleEdit = edit.map {
            CGPoint(
                x: $0.x.isFinite ? $0.x : fallback.x,
                y: $0.y.isFinite ? $0.y : fallback.y
            )
        }
        let positions = [visibleAdd, visibleEdit].compactMap { $0 }
        let minimumX = positions.map(\.x).min() ?? visibleAdd.x
        let maximumX = positions.map(\.x).max() ?? visibleAdd.x
        let horizontalShift: CGFloat
        if minimumX < margin {
            horizontalShift = margin - minimumX
        } else if maximumX > viewportSize.width - margin {
            horizontalShift = viewportSize.width - margin - maximumX
        } else {
            horizontalShift = 0
        }
        let visibleY = visibleAdd.y.clamped(to: margin...max(margin, viewportSize.height - margin))
        let shift: (CGPoint) -> CGPoint = { point in
            CGPoint(x: point.x + horizontalShift, y: visibleY)
        }
        return (shift(visibleAdd), visibleEdit.map(shift))
    }

    private func roleLabel(for node: TreeNodeLayout) -> String {
        node.id == focusedPersonID
            ? String(
                localized: "Selected person",
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
                fitTree(in: canvasSize, minimumScale: 0.08, centerOnFocusedPerson: false)
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
            commitZoom(magnification: 1.25, anchor: .center)
        }
    }

    private func zoomOut() {
        withAnimation(.smooth(duration: 0.22)) {
            commitZoom(magnification: 0.8, anchor: .center)
        }
    }

    private func commitZoom(magnification: CGFloat, anchor: UnitPoint) {
        guard scale > 0, canvasSize.width > 0, canvasSize.height > 0 else { return }
        let newScale = (scale * magnification).clamped(to: 0.08...1.8)
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

    private func fitTree(
        in size: CGSize,
        minimumScale: CGFloat = 0.08,
        centerOnFocusedPerson: Bool = false
    ) {
        guard size.width > 0, size.height > 0, !layout.nodes.isEmpty else { return }

        let cachedBounds = cachedConnectionPlan?.fingerprint == connectionPlanFingerprint
            ? cachedConnectionPlan?.plan.rawBounds
            : nil
        let contentBounds = cachedBounds ?? layout.nodes.reduce(into: CGRect.null) {
            $0 = $0.union(CGRect(
                x: $1.position.x - TreeVisualMetrics.nodeLabelWidth / 2,
                y: $1.position.y - TreeVisualMetrics.avatarRadius,
                width: TreeVisualMetrics.nodeLabelWidth,
                height: TreeVisualMetrics.avatarRadius + 100
            ))
        }
        guard !contentBounds.isNull, contentBounds.width > 0, contentBounds.height > 0 else { return }
        let fittedScale = min(
            size.width * 0.82 / contentBounds.width,
            size.height * 0.82 / contentBounds.height
        ).clamped(to: minimumScale...1.1)
        scale = fittedScale
        updateOverview(for: fittedScale)

        let contentCenter = CGPoint(x: contentBounds.midX, y: contentBounds.midY)
        let targetCenter = centerOnFocusedPerson
            ? layout.nodes.first(where: { $0.id == focusedPersonID })?.position ?? contentCenter
            : contentCenter
        offset = CGSize(
            width: (contentCenter.x - targetCenter.x) * scale,
            height: (contentCenter.y - targetCenter.y) * scale
        )
    }

    private func refreshConnectionPlan() {
        let requestedFingerprint = connectionPlanFingerprint
        guard cachedConnectionPlan?.fingerprint != requestedFingerprint else { return }
        connectionPlanTask?.cancel()
        cachedConnectionPlan = nil
        let requestedLayout = layout
        let requestedDrawingBounds = drawingBounds(for: requestedLayout.nodes)
        let requestedControlsVisible = showsAddControls
        let requestedSourcePersonCount = sourcePersonCount
        let requestID = UUID()
        connectionPlanRequestID = requestID
        connectionPlanTask = Task.detached(priority: .userInitiated) {
            let plan = TreeConnectionPlan.make(
                from: requestedLayout,
                showsRelationshipLabels: true,
                controlsVisible: requestedControlsVisible,
                sourcePersonCount: requestedSourcePersonCount
            )
            guard !Task.isCancelled else { return }
            await MainActor.run {
                guard requestID == connectionPlanRequestID,
                      connectionPlanTask?.isCancelled == false else { return }
                cachedConnectionPlan = CachedTreeConnectionPlan(
                    fingerprint: requestedFingerprint,
                    plan: plan,
                    drawingBounds: requestedDrawingBounds
                )
                connectionPlanTask = nil
            }
        }
    }

    private var connectionPlanFingerprint: TreeConnectionPlanFingerprint {
        TreeConnectionPlanFingerprint(
            layout: layout,
            controlsVisible: showsAddControls,
            sourcePersonCount: sourcePersonCount,
            localeIdentifier: AppLanguage.selectedLocale.identifier
        )
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

    private func avatarFill(for gender: PersonGender) -> Color {
        switch gender {
        case .male:
            Color(red: 226 / 255, green: 235 / 255, blue: 242 / 255)
        case .female:
            Color(red: 244 / 255, green: 228 / 255, blue: 232 / 255)
        case .unspecified:
            Color(red: 237 / 255, green: 229 / 255, blue: 216 / 255)
        }
    }

    private func avatarStroke(for gender: PersonGender) -> Color {
        switch gender {
        case .male:
            Color(red: 86 / 255, green: 115 / 255, blue: 141 / 255)
        case .female:
            Color(red: 152 / 255, green: 92 / 255, blue: 109 / 255)
        case .unspecified:
            Color(red: 121 / 255, green: 111 / 255, blue: 99 / 255)
        }
    }

    private func connectorStroke(for kind: RelationshipKind, scale: CGFloat) -> StrokeStyle {
        StrokeStyle(
            lineWidth: TreeVisualMetrics.connectorWidth(at: scale),
            lineCap: .round,
            lineJoin: .round,
            dash: kind == .sibling ? TreeVisualMetrics.connectorDash(at: scale) : []
        )
    }
}

private struct TreeZoomGestureState {
    var magnification: CGFloat = 1
    var anchor: UnitPoint = .center
}

private struct TreeActionControlLayout: Layout {
    let position: CGPoint

    func sizeThatFits(
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) -> CGSize {
        proposal.replacingUnspecifiedDimensions()
    }

    func placeSubviews(
        in bounds: CGRect,
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) {
        let margin = TreeVisualMetrics.minimumTapTarget / 2
        let x = (position.x.isFinite ? bounds.minX + position.x : bounds.midX)
            .clamped(to: bounds.minX + margin...max(bounds.minX + margin, bounds.maxX - margin))
        let y = (position.y.isFinite ? bounds.minY + position.y : bounds.midY)
            .clamped(to: bounds.minY + margin...max(bounds.minY + margin, bounds.maxY - margin))
        subviews.first?.place(
            at: CGPoint(x: x, y: y),
            anchor: .center,
            proposal: ProposedViewSize(
                width: TreeVisualMetrics.minimumTapTarget,
                height: TreeVisualMetrics.minimumTapTarget
            )
        )
    }
}

private struct CachedTreeConnectionPlan {
    let fingerprint: TreeConnectionPlanFingerprint
    let plan: TreeConnectionPlan
    let drawing: RenderedTreeConnectionDrawing

    init(
        fingerprint: TreeConnectionPlanFingerprint,
        plan: TreeConnectionPlan,
        drawingBounds: CGRect
    ) {
        self.fingerprint = fingerprint
        self.plan = plan
        drawing = RenderedTreeConnectionDrawing(
            plan: plan,
            bounds: drawingBounds
        )
    }
}

private struct RenderedTreeConnectionDrawing {
    let drawingBounds: CGRect
    let drawingOrigin: CGPoint
    let parentPaths: [Path]
    let nonParentPaths: [StyledTreeConnectorPath]
    let junctions: [CGPoint]
    let crossings: [RenderedTreeCrossing]
    let relationshipLabels: [RenderedRelationshipLabel]
    let controlsByNodeID: [String: RenderedTreeControl]

    init(plan: TreeConnectionPlan, bounds: CGRect) {
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

    init(provisionalLayout layout: TreeLayoutResult, bounds: CGRect) {
        let origin = CGPoint(x: bounds.minX, y: bounds.minY)
        let nodesByID = Dictionary(uniqueKeysWithValues: layout.nodes.map { ($0.id, $0) })
        drawingBounds = bounds
        drawingOrigin = origin

        func localPoint(_ point: CGPoint) -> CGPoint {
            CGPoint(x: point.x - origin.x, y: point.y - origin.y)
        }

        func path(for edge: TreeEdgeLayout) -> Path? {
            guard let from = nodesByID[edge.fromPersonID],
                  let to = nodesByID[edge.toPersonID] else { return nil }
            let points: [CGPoint]
            if edge.kind == .parent {
                let start = CGPoint(
                    x: from.position.x,
                    y: TreeRoutingGeometry.parentPortY(for: from)
                )
                let end = CGPoint(
                    x: to.position.x,
                    y: to.position.y - TreeVisualMetrics.avatarRadius
                )
                let railY = (start.y + end.y) / 2
                points = start.x == end.x
                    ? [start, end]
                    : [
                        start,
                        CGPoint(x: start.x, y: railY),
                        CGPoint(x: end.x, y: railY),
                        end,
                    ]
            } else {
                let ordered = from.position.x <= to.position.x ? (from, to) : (to, from)
                points = [
                    CGPoint(
                        x: ordered.0.position.x + TreeVisualMetrics.avatarRadius,
                        y: ordered.0.position.y
                    ),
                    CGPoint(
                        x: ordered.1.position.x - TreeVisualMetrics.avatarRadius,
                        y: ordered.1.position.y
                    ),
                ]
            }
            return TreeConnectorStyle.roundedPath(for: points, transform: localPoint)
        }

        parentPaths = layout.edges.filter { $0.kind == .parent }.compactMap(path)
        nonParentPaths = layout.edges.filter { $0.kind != .parent }.compactMap { edge in
            path(for: edge).map { StyledTreeConnectorPath(kind: edge.kind, path: $0) }
        }
        junctions = []
        crossings = []
        relationshipLabels = []
        controlsByNodeID = Dictionary(uniqueKeysWithValues: layout.nodes.map { node in
            let side: TreeRoutingGeometry.ControlPlacement.Side = node.position.x <= 0
                ? .left
                : .right
            return (node.id, RenderedTreeControl(side: side))
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
