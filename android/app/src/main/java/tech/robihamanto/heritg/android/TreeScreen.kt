package tech.robihamanto.heritg.android

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import tech.robihamanto.heritg.android.core.data.FamilyRepository
import tech.robihamanto.heritg.android.core.domain.semanticFormatter
import tech.robihamanto.heritg.android.core.model.FamilyRelationship
import tech.robihamanto.heritg.android.core.model.FamilyTree
import tech.robihamanto.heritg.android.core.model.Person
import tech.robihamanto.heritg.android.core.model.RelationshipKind
import tech.robihamanto.heritg.android.core.tree.TreeConnectionPlan
import tech.robihamanto.heritg.android.core.tree.TreeGenerationLimits
import tech.robihamanto.heritg.android.core.tree.TreeLayout
import tech.robihamanto.heritg.android.core.tree.TreeLayoutResult
import tech.robihamanto.heritg.android.core.tree.TreeNodeLayout
import tech.robihamanto.heritg.android.core.tree.TreeVisualMetrics
import kotlin.math.roundToInt

internal fun logicalToPixels(value: Double, density: Float): Float = value.toFloat() * density
internal fun nodeControlTargetSize(scale: Float): Float = 34f * scale

private data class TreeComputation(
    val layout: TreeLayoutResult,
    val limits: TreeGenerationLimits,
    val maxAbove: Int,
    val maxBelow: Int,
)

@Composable
internal fun TreeHost(
    tree: FamilyTree?, people: List<Person>, relationships: List<FamilyRelationship>,
    repository: FamilyRepository, uiState: AppUiState, onLibrary: () -> Unit, onOverlay: (Overlay) -> Unit,
    libraryPaneVisible: Boolean = false,
) {
    if (tree == null) return
    val prefix = "tree:${tree.id}:"
    var selectedId by uiState.state<String?>(prefix + "selected") { null }
    var limits by uiState.state(prefix + "limits") { TreeGenerationLimits() }
    var addTargetId by uiState.state<String?>(prefix + "addTarget") { null }
    val locale = LocalConfiguration.current.locales[0]
    LaunchedEffect(tree.id, people.map { it.id }, tree.lastSelectedPersonId) {
        if (selectedId !in people.map { it.id }) selectedId = tree.resolvedFocusId(people)
    }
    fun select(id: String?) {
        selectedId = id
        if (id != null) uiState.launch { repository.rememberSelectedPerson(tree.id, id) }
    }
    val computation by produceState<TreeComputation?>(null, people, relationships, selectedId, limits, locale) {
        value = withContext(Dispatchers.Default) {
            val snapshots = people.snapshots(locale)
            val relationshipSnapshots = relationships.snapshots()
            val available = TreeLayout.availableGenerationLevels(selectedId, snapshots, relationshipSnapshots)
            val actualLimits = limits.clamped(available)
            TreeComputation(
                TreeLayout.make(
                    null, snapshots, relationshipSnapshots, selectedId, actualLimits, semanticFormatter(locale),
                ),
                actualLimits, available.ancestorLevels, available.descendantLevels,
            )
        }
    }
    LaunchedEffect(computation?.limits) { computation?.limits?.let { if (limits != it) limits = it } }
    computation?.let { result -> TreeCanvas(
        layout = result.layout, selectedId = selectedId, limits = result.limits,
        maxAbove = result.maxAbove, maxBelow = result.maxBelow,
        onLimits = { limits = it }, onSelect = ::select, onAdd = { select(it); addTargetId = it },
        onEdit = { onOverlay(Overlay.Edit(it)) }, onFirstPerson = { onOverlay(Overlay.FirstPerson) },
        showLibrary = !libraryPaneVisible,
        navigationIcon = if (uiState.canNavigateBack) R.drawable.ic_arrow_back else R.drawable.ic_menu,
        onLibrary = { if (uiState.canNavigateBack) uiState.navigateBack() else onLibrary() },
        onPeople = { onOverlay(Overlay.People) },
        onSettings = { onOverlay(Overlay.Settings(tree.id, limits)) },
    ) }
    addTargetId?.let { id -> people.firstOrNull { it.id == id } }?.let { target -> AlertDialog(
        onDismissRequest = { addTargetId = null }, title = { Text(stringResource(R.string.add_to, target.displayName)) },
        text = { Column {
            Button(onClick = { addTargetId = null; onOverlay(Overlay.Add(target.id)) },
                modifier = Modifier.testTag("relationship.action.add")) { Text(stringResource(R.string.add_person)) }
            TextButton(onClick = { addTargetId = null; onOverlay(Overlay.Link(target.id)) },
                enabled = people.size > 1, modifier = Modifier.testTag("relationship.action.link")) {
                Text(stringResource(R.string.link_existing))
            }
        } }, confirmButton = {}, dismissButton = { TextButton(onClick = { addTargetId = null }) { Text(stringResource(R.string.cancel)) } },
    ) }
}

@Composable
private fun TreeCanvas(
    layout: TreeLayoutResult, selectedId: String?, limits: TreeGenerationLimits, maxAbove: Int, maxBelow: Int,
    onLimits: (TreeGenerationLimits) -> Unit, onSelect: (String?) -> Unit, onAdd: (String) -> Unit,
    onEdit: (String) -> Unit, onFirstPerson: () -> Unit, showLibrary: Boolean, navigationIcon: Int,
    onLibrary: () -> Unit, onPeople: () -> Unit, onSettings: () -> Unit,
) {
    val density = LocalDensity.current
    val densityValue = density.density
    var scale by remember { mutableFloatStateOf(1f) }
    var translation by remember { mutableStateOf(Offset.Zero) }
    var viewport by remember { mutableStateOf(Offset.Zero) }
    var showControls by remember { mutableStateOf(true) }
    fun logical(value: Double) = logicalToPixels(value, densityValue)
    fun center(x: Double, y: Double) = Offset(
        viewport.x / 2 + logical(x) * scale + translation.x,
        viewport.y / 2 + logical(y) * scale + translation.y,
    )
    fun fit(minimum: Float = .2f, centerId: String? = null) {
        if (layout.nodes.isEmpty() || viewport.x <= 0) return
        val minX = logical(layout.nodes.minOf { it.position.x }); val maxX = logical(layout.nodes.maxOf { it.position.x })
        val minY = logical(layout.nodes.minOf { it.position.y }); val maxY = logical(layout.nodes.maxOf { it.position.y })
        val horizontalPadding = with(density) { 64.dp.toPx() }
        val verticalPadding = with(density) { 180.dp.toPx() }
        val nodeExtent = logical(TreeVisualMetrics.NodeLabelWidth)
        scale = minOf(
            (viewport.x - horizontalPadding).coerceAtLeast(1f) / (maxX - minX + nodeExtent),
            (viewport.y - verticalPadding).coerceAtLeast(1f) / (maxY - minY + nodeExtent),
        )
            .coerceIn(minimum, 1.25f)
        val target = centerId?.let { id -> layout.nodes.firstOrNull { it.id == id }?.position }
        translation = if (target == null) {
            Offset(-(minX + maxX) / 2 * scale, -(minY + maxY) / 2 * scale)
        } else Offset(-logical(target.x) * scale, -logical(target.y) * scale)
    }
    fun zoomBy(factor: Float) {
        if (layout.nodes.isEmpty()) return
        val oldScale = scale
        val newScale = (scale * factor).coerceIn(.2f, 1.8f)
        val centerX = logical((layout.nodes.minOf { it.position.x } + layout.nodes.maxOf { it.position.x }) / 2)
        val centerY = logical((layout.nodes.minOf { it.position.y } + layout.nodes.maxOf { it.position.y }) / 2)
        val screenCenter = Offset(centerX * oldScale + translation.x, centerY * oldScale + translation.y)
        scale = newScale
        translation = Offset(screenCenter.x - centerX * newScale, screenCenter.y - centerY * newScale)
    }
    LaunchedEffect(layout, viewport, densityValue) { fit(.72f, selectedId) }
    LaunchedEffect(selectedId) { if (selectedId != null) fit(.9f, selectedId) }
    Box(
        Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)
            .windowInsetsPadding(WindowInsets.safeDrawing)
            .onSizeChanged { viewport = Offset(it.width.toFloat(), it.height.toFloat()) }
            .pointerInput(layout) { detectTapGestures { onSelect(null) } }
            .pointerInput(layout) { detectTransformGestures { centroid, pan, zoom, _ ->
                val old = scale; val next = (scale * zoom).coerceIn(.2f, 1.8f); val ratio = next / old
                val relativeCentroid = centroid - viewport / 2f
                translation = relativeCentroid + (translation - relativeCentroid) * ratio + pan
                scale = next
            } },
    ) {
        if (layout.nodes.isEmpty()) {
            Button(onClick = onFirstPerson, modifier = Modifier.align(Alignment.Center).testTag("tree.createFirstPerson")) {
                Text(stringResource(R.string.add_first_person))
            }
        } else {
            Connections(layout, scale, translation, viewport, selectedId != null)
            val overscan = with(density) { 220.dp.toPx() }
            layout.nodes.filter { node ->
                val position = center(node.position.x, node.position.y)
                viewport == Offset.Zero || position.x in -overscan..(viewport.x + overscan) &&
                    position.y in -overscan..(viewport.y + overscan)
            }.forEach { node ->
                val person = node.person
                val nodeCenter = center(node.position.x, node.position.y)
                val role = if (node.id == selectedId) stringResource(R.string.you) else node.role
                val addDescription = stringResource(R.string.add_relative_to, person.name)
                val editDescription = stringResource(R.string.edit_person_named, person.name)
                val selectDescription = stringResource(R.string.select_person_named, person.name)
                val addSide = addControlSide(
                    occupiedSides(layout, node),
                    if (node.position.x <= 0) NodeSide.Left else NodeSide.Right,
                )
                val addOffset = controlOffset(addSide)
                val nodeTargetWidth = (TreeVisualMetrics.NodeLabelWidth.toFloat() * scale).coerceAtLeast(48f)
                val nodeTargetHeight = ((TreeVisualMetrics.AvatarDiameter + TreeVisualMetrics.NodeLabelTopSpacing +
                    TreeVisualMetrics.LabelHeight).toFloat() * scale).coerceAtLeast(48f)
                Box(
                    Modifier.align(Alignment.TopStart).width(nodeTargetWidth.dp).height(nodeTargetHeight.dp)
                        .offsetPx(
                            nodeCenter.x - with(density) { (nodeTargetWidth / 2).dp.toPx() },
                            nodeCenter.y - logical(TreeVisualMetrics.AvatarRadius) * scale,
                        )
                        .clickable(role = Role.Button) { onSelect(node.id) }
                        .clearAndSetSemantics {
                            contentDescription = person.name
                            stateDescription = role
                            selected = node.id == selectedId
                            this.role = Role.Button
                            onClick(selectDescription) { onSelect(node.id); true }
                            customActions = buildList {
                                if (showControls) add(CustomAccessibilityAction(addDescription) { onAdd(node.id); true })
                                if (showControls && node.id == selectedId) {
                                    add(CustomAccessibilityAction(editDescription) { onEdit(node.id); true })
                                }
                            }
                        }
                        .testTag("person.node.${node.id}"),
                )
                Column(
                    Modifier.align(Alignment.TopStart).width(190.dp)
                        .offsetPx(
                            nodeCenter.x - logical(TreeVisualMetrics.NodeLabelWidth / 2),
                            nodeCenter.y - logical(TreeVisualMetrics.AvatarRadius) * scale,
                        )
                        .graphicsLayer {
                            scaleX = scale
                            scaleY = scale
                            transformOrigin = TransformOrigin(.5f, 0f)
                        }
                        .clearAndSetSemantics { },
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Box(
                        Modifier.size(64.dp).background(MaterialTheme.colorScheme.surface, CircleShape)
                            .border(if (node.id == selectedId) 2.dp else 1.dp,
                                if (node.id == selectedId) MaterialTheme.colorScheme.primary
                                else MaterialTheme.colorScheme.outline, CircleShape),
                        contentAlignment = Alignment.Center,
                    ) {
                        val photo by rememberPhotoThumbnail(person.id, person.profilePhotoData, with(density) { 64.dp.roundToPx() })
                        if (photo == null) {
                            Text(person.name.take(1).uppercase(), fontSize = 22.sp, fontWeight = FontWeight.Bold)
                        } else {
                            Image(photo!!.asImageBitmap(), null, Modifier.size(54.dp).clip(CircleShape),
                                contentScale = ContentScale.Crop)
                        }
                    }
                    Text(person.name, fontWeight = FontWeight.Bold, maxLines = 1, textAlign = TextAlign.Center)
                    if (selectedId != null) Text(role, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp, maxLines = 1)
                    person.lifeSummary?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, maxLines = 1) }
                }
                if (showControls) {
                    NodeControl(
                        icon = R.drawable.ic_add,
                        description = addDescription,
                        color = MaterialTheme.colorScheme.secondary,
                        contentColor = MaterialTheme.colorScheme.onSecondary,
                        onClick = { onAdd(node.id) },
                        modifier = Modifier.align(Alignment.TopStart).offsetPx(
                            nodeCenter.x + logical(addOffset.x.toDouble()) * scale - with(density) { (17 * scale).dp.toPx() },
                            nodeCenter.y + logical(addOffset.y.toDouble()) * scale - with(density) { (17 * scale).dp.toPx() },
                        ).testTag("person.add.${node.id}"), visualScale = scale,
                    )
                }
                if (showControls && node.id == selectedId) {
                    val editOffset = adjacentControlOffset(addOffset, addSide)
                    NodeControl(
                        icon = R.drawable.ic_edit,
                        description = editDescription,
                        color = MaterialTheme.colorScheme.tertiary,
                        contentColor = MaterialTheme.colorScheme.onTertiary,
                        onClick = { onEdit(node.id) },
                        modifier = Modifier.align(Alignment.TopStart).offsetPx(
                            nodeCenter.x + logical(editOffset.x.toDouble()) * scale - with(density) { (17 * scale).dp.toPx() },
                            nodeCenter.y + logical(editOffset.y.toDouble()) * scale - with(density) { (17 * scale).dp.toPx() },
                        ).testTag("person.edit.${node.id}"), visualScale = scale,
                    )
                }
            }
        }
        TreeControls(
            hasPeople = layout.nodes.isNotEmpty(), showControls = showControls, limits = limits,
            maxAbove = maxAbove, maxBelow = maxBelow, showLibrary = showLibrary,
            navigationIcon = navigationIcon, onLibrary = onLibrary, onPeople = onPeople, onSettings = onSettings,
            onZoomIn = { zoomBy(1.25f) },
            onZoomOut = { zoomBy(1 / 1.25f) }, onFit = { fit(.2f) },
            onToggle = { showControls = !showControls }, onLimits = onLimits,
        )
    }
}

private fun Modifier.offsetPx(x: Float, y: Float) = offset { IntOffset(x.roundToInt(), y.roundToInt()) }
private enum class NodeSide { Left, Right, Top, Bottom, TopLeft, TopRight }
private fun occupiedSides(layout: TreeLayoutResult, node: TreeNodeLayout): Set<NodeSide> = buildSet {
    layout.edges.forEach { edge ->
        val other = when (node.id) {
            edge.fromPersonId -> edge.to
            edge.toPersonId -> edge.from
            else -> return@forEach
        }
        when (edge.kind) {
            RelationshipKind.PARENT -> add(if (other.y < node.position.y) NodeSide.Top else NodeSide.Bottom)
            RelationshipKind.PARTNER, RelationshipKind.SIBLING ->
                add(if (other.x < node.position.x) NodeSide.Left else NodeSide.Right)
        }
    }
}
private fun addControlSide(occupied: Set<NodeSide>, preferred: NodeSide): NodeSide = run {
    val opposite = if (preferred == NodeSide.Left) NodeSide.Right else NodeSide.Left
    val diagonal = if (preferred == NodeSide.Left) NodeSide.TopLeft else NodeSide.TopRight
    listOf(preferred, opposite, NodeSide.Top, NodeSide.Bottom, diagonal).firstOrNull { it !in occupied } ?: preferred
}
private fun controlOffset(side: NodeSide): Offset {
    val offset = TreeVisualMetrics.AvatarRadius + 34
    val bottomOffset = TreeVisualMetrics.LabelOffset + TreeVisualMetrics.LabelHeight / 2 + 34
    return when (side) {
        NodeSide.Left -> Offset(-offset.toFloat(), 0f)
        NodeSide.Right -> Offset(offset.toFloat(), 0f)
        NodeSide.Top -> Offset(0f, -offset.toFloat())
        NodeSide.Bottom -> Offset(0f, bottomOffset.toFloat())
        NodeSide.TopLeft -> Offset(-offset.toFloat(), -offset.toFloat())
        NodeSide.TopRight -> Offset(offset.toFloat(), -offset.toFloat())
    }
}
private fun adjacentControlOffset(offset: Offset, side: NodeSide): Offset {
    val spacing = nodeControlTargetSize(1f)
    return when (side) {
        NodeSide.Left -> offset + Offset(-spacing, 0f)
        NodeSide.Right -> offset + Offset(spacing, 0f)
        NodeSide.Top -> offset + Offset(0f, -spacing)
        NodeSide.Bottom -> offset + Offset(0f, spacing)
        NodeSide.TopLeft -> offset + Offset(-spacing, -spacing)
        NodeSide.TopRight -> offset + Offset(spacing, -spacing)
    }
}
@Composable
private fun NodeControl(
    icon: Int, description: String, color: Color, contentColor: Color, onClick: () -> Unit,
    modifier: Modifier = Modifier, visualScale: Float = 1f,
) {
    Box(
        modifier.size(nodeControlTargetSize(visualScale).dp).clickable(role = Role.Button, onClick = onClick)
            .clearAndSetSemantics {
            contentDescription = description
            role = Role.Button
            onClick(description) { onClick(); true }
        },
        contentAlignment = Alignment.Center,
    ) {
        Box(Modifier.size((24 * visualScale).dp).background(color, CircleShape), contentAlignment = Alignment.Center) {
            Icon(
                painterResource(icon),
                contentDescription = null,
                tint = contentColor,
                modifier = Modifier.size((14 * visualScale).dp),
            )
        }
    }
}

@Composable
private fun Connections(
    layout: TreeLayoutResult,
    scale: Float,
    translation: Offset,
    viewport: Offset,
    relationshipLabels: Boolean,
) {
    val locale = LocalConfiguration.current.locales[0]
    val density = LocalDensity.current
    val densityValue = density.density
    val background = MaterialTheme.colorScheme.background
    val line = MaterialTheme.colorScheme.outline
    val plan by produceState<TreeConnectionPlan?>(null, layout, relationshipLabels) {
        value = withContext(Dispatchers.Default) { TreeConnectionPlan.make(layout, relationshipLabels) }
    }
    val connectionPlan = plan ?: return
    Canvas(Modifier.fillMaxSize()) {
        fun logical(value: Double) = logicalToPixels(value, densityValue)
        fun point(x: Double, y: Double) = Offset(
            viewport.x / 2 + logical(x) * scale + translation.x,
            viewport.y / 2 + logical(y) * scale + translation.y,
        )
        val strokeWidth = with(density) { 1.5.dp.toPx() }
        connectionPlan.families.flatMap { it.segments }.forEach { segment ->
            drawLine(line, point(segment.start.x, segment.start.y), point(segment.end.x, segment.end.y), strokeWidth)
        }
        connectionPlan.nonParentEdges.forEach { edge ->
            val left = if (edge.from.x <= edge.to.x) edge.from else edge.to
            val right = if (edge.from.x <= edge.to.x) edge.to else edge.from
            val inset = if (left.x == right.x) 0 else 32
            val from = point(left.x + inset, left.y)
            val to = point(right.x - inset, right.y)
            if (edge.kind == RelationshipKind.PARTNER) drawLine(line, from, to, strokeWidth)
            else {
                val path = Path().apply {
                    moveTo(from.x, from.y)
                    quadraticTo((from.x + to.x) / 2, from.y - logical(16.0) * scale, to.x, to.y)
                }
                drawPath(path, line, style = Stroke(strokeWidth))
            }
        }
        connectionPlan.families.flatMap { it.junctions }.forEach {
            drawCircle(line, with(density) { 2.dp.toPx() }, point(it.x, it.y))
        }
        connectionPlan.crossings.forEach {
            val center = point(it.x, it.y)
            val gap = with(density) { 5.dp.toPx() }
            drawCircle(background, with(density) { 4.dp.toPx() }, center)
            drawLine(line, center.copy(y = center.y - gap), center.copy(y = center.y + gap), strokeWidth)
        }
    }
    if (relationshipLabels) layout.edges.forEach { edge ->
        edge.marriageLabel(semanticFormatter(locale))?.let { label ->
            val center = Offset(
                viewport.x / 2 + logicalToPixels((edge.from.x + edge.to.x) / 2, densityValue) * scale + translation.x,
                viewport.y / 2 + logicalToPixels((edge.from.y + edge.to.y) / 2, densityValue) * scale + translation.y,
            )
            val overscan = with(density) { 100.dp.toPx() }
            if (center.x !in -overscan..(viewport.x + overscan) || center.y !in -overscan..(viewport.y + overscan)) {
                return@let
            }
            Text(
                label,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 10.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.offsetPx(
                    center.x - with(density) { 50.dp.toPx() },
                    center.y - with(density) { 24.dp.toPx() },
                ).width(100.dp)
                    .background(background, RoundedCornerShape(10.dp))
                    .graphicsLayer { scaleX = scale; scaleY = scale }
                    .semantics { contentDescription = label },
            )
        }
    }
}
