import SwiftUI

struct HeritgTreeCanvas: View {
    let layout: TreeLayoutResult
    let connectionPlan: TreeConnectionPlan
    let sourcePersonCount: Int
    let focusedPersonID: String?
    let isPreparingLayout: Bool
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
    @State private var hasFittedInitialLayout = false
    @GestureState private var drag: CGSize = .zero
    @GestureState private var zoomState = TreeZoomGestureState()

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                HeritgColor.treeCanvas.ignoresSafeArea()

                if layout.nodes.isEmpty {
                    if sourcePersonCount == 0 {
                        emptyCanvas
                    }
                    emptyControls
                } else {
                    tree(in: proxy.size)
                    if showsAddControls {
                        controls
                    }
                }

                if isPreparingLayout {
                    layoutProgressIndicator
                }
            }
            .onAppear {
                canvasSize = proxy.size
                hasFittedInitialLayout = fitTree(in: proxy.size)
            }
            .onChange(of: proxy.size) { size in
                canvasSize = size
                _ = fitTree(in: size)
            }
        }
        .overlay(alignment: .bottomLeading) {
            if !layout.nodes.isEmpty {
                toggleControlsButton
                    .padding(16)
            }
        }
        .onChange(of: layout.nodes.isEmpty) { isEmpty in
            if isEmpty {
                hasFittedInitialLayout = false
            }
        }
        .onChange(of: connectionPlan.rawBounds) { bounds in
            if !hasFittedInitialLayout,
               fitTree(in: canvasSize, contentBounds: bounds) {
                hasFittedInitialLayout = true
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

    private var layoutProgressIndicator: some View {
        VStack {
            HStack(spacing: 10) {
                ProgressView()
                Text("Updating relationships...")
                    .font(.callout.weight(.semibold))
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(.regularMaterial, in: Capsule())
            .shadow(color: .black.opacity(0.12), radius: 12, y: 4)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("tree.selectionProgress")

            Spacer()
        }
        .padding(.top, 12)
        .allowsHitTesting(false)
    }

    private func tree(in size: CGSize) -> some View {
        let center = CGPoint(x: size.width / 2, y: size.height / 2)
        let connectionDrawing = RenderedTreeConnectionDrawing(plan: connectionPlan)
        let drawingBounds = connectionDrawing.drawingBounds
        let drawingOrigin = connectionDrawing.drawingOrigin
        let renderOffset = CGSize(
            width: offset.width + drag.width,
            height: offset.height + drag.height
        )
        let effectiveScale = (scale * zoomState.magnification).clamped(to: 0.08...1.8)
        let gestureMagnification = effectiveScale / scale
        let projectedOffset = CGSize(
            width: renderOffset.width * gestureMagnification,
            height: renderOffset.height * gestureMagnification
        )
        let controlsByNodeID = Dictionary(uniqueKeysWithValues: connectionPlan.controls.map {
            ($0.personID, RenderedTreeControl(side: $0.side))
        })
        let hitTargets = actionHitTargets(
            viewportSize: size,
            drawingBounds: drawingBounds,
            effectiveScale: effectiveScale,
            projectedOffset: projectedOffset,
            controlsByNodeID: controlsByNodeID
        )
        return ZStack {
            Color.clear
                .contentShape(Rectangle())
                .onTapGesture(perform: onDeselectPerson)

            connectionCanvas(
                connectionDrawing,
                viewportSize: size,
                effectiveScale: effectiveScale,
                projectedOffset: projectedOffset
            )

            ZStack {
                ForEach(connectionDrawing.relationshipLabels) { label in
                    relationshipEdgeLabel(label)
                        .position(label.center)
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
            .position(x: center.x, y: center.y)
            .scaleEffect(scale, anchor: .center)
            .offset(renderOffset)
            .scaleEffect(gestureMagnification, anchor: zoomState.anchor)

            ForEach(layout.nodes) { node in
                personHitTarget(
                    for: node,
                    viewportSize: size,
                    drawingBounds: drawingBounds,
                    effectiveScale: effectiveScale,
                    projectedOffset: projectedOffset
                )
            }

            ForEach(layout.nodes) { node in
                let control = controlsByNodeID[node.id] ?? RenderedTreeControl(
                    side: node.position.x <= 0 ? .left : .right
                )
                actionControls(
                    for: node,
                    control: control,
                    viewportSize: size,
                    drawingBounds: connectionPlan.rawBounds,
                    effectiveScale: effectiveScale,
                    projectedOffset: projectedOffset
                )
            }

            ForEach(hitTargets) { target in
                TreeCanvasActionButton(target: target) {
                    switch target.kind {
                    case .add:
                        onAddRelative(target.personID)
                    case .edit:
                        guard let node = layout.nodes.first(where: { $0.id == target.personID }) else {
                            return
                        }
                        onEditPerson(target.personID, roleLabel(for: node))
                    }
                }
                .frame(width: target.size, height: target.size)
                .position(target.center)
            }
        }
        .frame(width: size.width, height: size.height)
        .contentShape(Rectangle())
        .gesture(panGesture)
        .simultaneousGesture(zoomGesture)
    }

    private func actionHitTargets(
        viewportSize: CGSize,
        drawingBounds: CGRect,
        effectiveScale: CGFloat,
        projectedOffset: CGSize,
        controlsByNodeID: [String: RenderedTreeControl]
    ) -> [TreeCanvasActionHitTarget] {
        layout.nodes.flatMap { node -> [TreeCanvasActionHitTarget] in
            guard showsActions(for: node) else { return [] }
            let control = controlsByNodeID[node.id] ?? RenderedTreeControl(
                side: node.position.x <= 0 ? .left : .right
            )
            let hitTargetSize = TreeVisualMetrics.actionHitTarget(at: effectiveScale)
            var targets = [TreeCanvasActionHitTarget(
                identifier: "person.add.\(node.person.id)",
                personID: node.person.id,
                kind: .add,
                label: AppLanguage.localized("Add relative to \(node.person.name)"),
                center: projectedActionPosition(
                    node: node,
                    side: control.side,
                    index: 0,
                    viewportSize: viewportSize,
                    drawingBounds: drawingBounds,
                    effectiveScale: effectiveScale,
                    projectedOffset: projectedOffset
                ),
                size: hitTargetSize
            )]
            if node.id == focusedPersonID {
                targets.append(TreeCanvasActionHitTarget(
                    identifier: "person.edit.\(node.person.id)",
                    personID: node.person.id,
                    kind: .edit,
                    label: AppLanguage.localized("Edit \(node.person.name)"),
                    center: projectedActionPosition(
                        node: node,
                        side: control.side,
                        index: 1,
                        viewportSize: viewportSize,
                        drawingBounds: drawingBounds,
                        effectiveScale: effectiveScale,
                        projectedOffset: projectedOffset
                    ),
                    size: hitTargetSize
                ))
            }
            return targets
        }
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
        let junctionRadius = TreeConnectorStyle.junctionRadius * effectiveScale
        let crossingRadius = TreeConnectorStyle.crossingRadius * effectiveScale

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
                let bridgeHalfHeight = 6 * effectiveScale
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

    private func personHitTarget(
        for node: TreeNodeLayout,
        viewportSize: CGSize,
        drawingBounds: CGRect,
        effectiveScale: CGFloat,
        projectedOffset: CGSize
    ) -> some View {
        let role = roleLabel(for: node)
        let position = TreeViewportTransform.project(
            node.position,
            from: drawingBounds,
            into: viewportSize,
            scale: effectiveScale,
            offset: projectedOffset
        )
        let hitSize = max(
            TreeVisualMetrics.minimumTapTarget,
            TreeVisualMetrics.avatarDiameter * effectiveScale
        )
        return Button {
            onSelectPerson(node.person.id, role)
        } label: {
            Color.clear
                .frame(width: hitSize, height: hitSize)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .position(position)
        .accessibilityLabel(node.person.name)
        .accessibilityValue(focusedPersonID == nil ? "" : role)
        .accessibilityHint("Selects this person")
        .accessibilityIdentifier("person.node.\(node.person.id)")
    }

    private func personNode(
        _ node: TreeNodeLayout,
        anchor: CGPoint
    ) -> some View {
        let showsRelationship = focusedPersonID != nil
        let role = roleLabel(for: node)
        let name = TreeVisualMetrics.formattedName(node.person.name)
        let city = TreeVisualMetrics.formattedCity(node.person.city)
        let avatarFill = avatarFill(for: node.person.gender)
        let avatarStroke = avatarStroke(for: node.person.gender)

        return ZStack {
            Circle()
                .fill(avatarFill)
                .frame(
                    width: TreeVisualMetrics.avatarDiameter,
                    height: TreeVisualMetrics.avatarDiameter
                )
                .overlay {
                    ProfilePhotoAvatar(
                        data: node.person.profilePhotoData,
                        initials: name.fullName.prefix(1).uppercased(),
                        size: TreeVisualMetrics.avatarDiameter - 10,
                        background: avatarFill
                    )
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
                .position(anchor)
                .allowsHitTesting(false)
                .accessibilityHidden(true)

            if let birthOrder = node.birthOrder {
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

            Text(verbatim: name.text)
                .font(.system(size: TreeVisualMetrics.nameFontSize, weight: .bold))
                .foregroundStyle(HeritgColor.text)
                .lineLimit(2)
                .multilineTextAlignment(.center)
                .frame(
                    width: TreeVisualMetrics.nodeLabelWidth,
                    height: TreeVisualMetrics.nameHeight + name.extraHeight
                )
                .position(
                    x: anchor.x,
                    y: anchor.y + 42 + (TreeVisualMetrics.nameHeight + name.extraHeight) / 2
                )
                .allowsHitTesting(false)
                .accessibilityHidden(true)

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
                    .frame(width: TreeVisualMetrics.nodeLabelWidth, height: TreeVisualMetrics.roleHeight)
                    .position(
                        x: anchor.x,
                        y: anchor.y + TreeVisualMetrics.roleTop + name.extraHeight +
                            TreeVisualMetrics.roleHeight / 2
                    )
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }

            if let lifeSummary = node.person.lifeSummary {
                Text(lifeSummary)
                    .font(.caption2)
                    .foregroundStyle(HeritgColor.subtleText)
                    .lineLimit(1)
                    .frame(width: TreeVisualMetrics.nodeLabelWidth, height: TreeVisualMetrics.lifeHeight)
                    .position(
                        x: anchor.x,
                        y: anchor.y + (showsRelationship
                            ? TreeVisualMetrics.lifeTop
                            : TreeVisualMetrics.roleTop) + name.extraHeight +
                            TreeVisualMetrics.lifeHeight / 2
                    )
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }

            if let city {
                let cityTop = node.person.lifeSummary != nil
                    ? (showsRelationship
                        ? TreeVisualMetrics.lifeTop
                        : TreeVisualMetrics.roleTop) + TreeVisualMetrics.lifeHeight
                    : showsRelationship
                        ? TreeVisualMetrics.roleTop + TreeVisualMetrics.roleHeight
                        : TreeVisualMetrics.nodeLabelTopSpacing + TreeVisualMetrics.avatarRadius +
                            TreeVisualMetrics.nameHeight
                Text(city)
                    .font(.caption2)
                    .foregroundStyle(HeritgColor.subtleText)
                    .lineLimit(1)
                    .frame(width: TreeVisualMetrics.nodeLabelWidth, height: TreeVisualMetrics.lifeHeight)
                    .position(
                        x: anchor.x,
                        y: anchor.y + cityTop + name.extraHeight +
                            TreeVisualMetrics.lifeHeight / 2
                    )
                    .allowsHitTesting(false)
                    .accessibilityHidden(true)
            }
        }
        .accessibilityHidden(true)
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

    private func showsActions(for node: TreeNodeLayout) -> Bool {
        showsAddControls && (sourcePersonCount <= 24 || node.id == focusedPersonID)
    }

    @ViewBuilder
    private func actionControls(
        for node: TreeNodeLayout,
        control: RenderedTreeControl,
        viewportSize: CGSize,
        drawingBounds: CGRect,
        effectiveScale: CGFloat,
        projectedOffset: CGSize
    ) -> some View {
        if showsActions(for: node) {
            let visualScale = TreeVisualMetrics.actionVisualScale(at: effectiveScale)
            let hitTargetSize = TreeVisualMetrics.actionHitTarget(at: effectiveScale)
            let addPosition = projectedActionPosition(
                node: node,
                side: control.side,
                index: 0,
                viewportSize: viewportSize,
                drawingBounds: drawingBounds,
                effectiveScale: effectiveScale,
                projectedOffset: projectedOffset
            )
            let editPosition = node.id == focusedPersonID
                ? projectedActionPosition(
                    node: node,
                    side: control.side,
                    index: 1,
                    viewportSize: viewportSize,
                    drawingBounds: drawingBounds,
                    effectiveScale: effectiveScale,
                    projectedOffset: projectedOffset
                )
                : nil
            addActionVisual(
                visualScale: visualScale,
                hitTargetSize: hitTargetSize
            )
            .position(addPosition)
            if let editPosition {
                editActionVisual(
                    visualScale: visualScale,
                    hitTargetSize: hitTargetSize
                )
                .position(editPosition)
            }
        }
    }

    private func addActionVisual(
        visualScale: CGFloat,
        hitTargetSize: CGFloat
    ) -> some View {
        Image(systemName: "plus")
            .font(.system(size: 16 * visualScale, weight: .bold))
            .foregroundStyle(.white)
            .frame(width: hitTargetSize, height: hitTargetSize)
            .background {
                Circle()
                    .fill(HeritgColor.add)
                    .frame(width: 28 * visualScale, height: 28 * visualScale)
            }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func editActionVisual(
        visualScale: CGFloat,
        hitTargetSize: CGFloat
    ) -> some View {
        Image(systemName: "pencil")
            .font(.system(size: 14 * visualScale, weight: .bold))
            .foregroundStyle(.white)
            .frame(width: hitTargetSize, height: hitTargetSize)
            .background {
                Circle()
                    .fill(HeritgColor.brand)
                    .frame(width: 28 * visualScale, height: 28 * visualScale)
            }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func projectedActionPosition(
        node: TreeNodeLayout,
        side: TreeRoutingGeometry.ControlPlacement.Side,
        index: CGFloat,
        viewportSize: CGSize,
        drawingBounds: CGRect,
        effectiveScale: CGFloat,
        projectedOffset: CGSize
    ) -> CGPoint {
        let logical = actionPosition(
            anchor: node.position,
            side: side,
            index: index,
            scale: effectiveScale
        )
        return TreeViewportTransform.project(
            logical,
            from: drawingBounds,
            into: viewportSize,
            scale: effectiveScale,
            offset: projectedOffset
        )
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
        scale: CGFloat
    ) -> CGPoint {
        let direction: CGFloat = side == .left ? -1 : 1
        let distance = TreeVisualMetrics.actionDistance(index: index, at: scale)
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
                _ = fitTree(in: canvasSize)
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
    }

    private func fitTree(
        in size: CGSize,
        minimumScale: CGFloat = 0.08,
        centerOnFocusedPerson: Bool = false,
        contentBounds: CGRect? = nil
    ) -> Bool {
        guard size.width > 0, size.height > 0 else { return false }

        let contentBounds = contentBounds ?? connectionPlan.rawBounds
        guard !contentBounds.isNull, contentBounds.width > 0, contentBounds.height > 0 else {
            return false
        }
        let fittedScale = min(
            size.width * 0.82 / contentBounds.width,
            size.height * 0.82 / contentBounds.height
        ).clamped(to: minimumScale...1.1)
        scale = fittedScale

        let contentCenter = CGPoint(x: contentBounds.midX, y: contentBounds.midY)
        let targetCenter = centerOnFocusedPerson
            ? layout.nodes.first(where: { $0.id == focusedPersonID })?.position ?? contentCenter
            : contentCenter
        offset = CGSize(
            width: (contentCenter.x - targetCenter.x) * scale,
            height: (contentCenter.y - targetCenter.y) * scale
        )
        return true
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

private struct RenderedTreeConnectionDrawing {
    let drawingBounds: CGRect
    let drawingOrigin: CGPoint
    let parentPaths: [Path]
    let nonParentPaths: [StyledTreeConnectorPath]
    let junctions: [CGPoint]
    let crossings: [RenderedTreeCrossing]
    let relationshipLabels: [RenderedRelationshipLabel]

    init(plan: TreeConnectionPlan) {
        let bounds = plan.rawBounds
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
