package tech.robihamanto.heritg.android

import androidx.compose.foundation.background
import androidx.compose.foundation.text.TextAutoSize
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import tech.robihamanto.heritg.android.core.tree.TreeGenerationLimits
import tech.robihamanto.heritg.android.core.tree.TreeVisualMetrics

@Composable
internal fun TreeControls(
    hasPeople: Boolean, showControls: Boolean, limits: TreeGenerationLimits, maxAbove: Int, maxBelow: Int,
    showLibrary: Boolean, navigationIcon: Int, onLibrary: () -> Unit, onPeople: () -> Unit, onSettings: () -> Unit,
    onZoomIn: () -> Unit, onZoomOut: () -> Unit, onFit: () -> Unit, onToggle: () -> Unit,
    onLimits: (TreeGenerationLimits) -> Unit,
) {
    var menu by remember { mutableStateOf(false) }
    val toggleState = stringResource(if (showControls) R.string.shown else R.string.hidden)
    Box(Modifier.fillMaxSize().padding(16.dp)) {
        if (showControls) {
            if (showLibrary) Control(
                navigationIcon, "tree.library",
                stringResource(if (navigationIcon == R.drawable.ic_arrow_back) R.string.back else R.string.family_trees),
                onLibrary, Modifier.align(Alignment.TopStart),
            )
            Row(Modifier.align(Alignment.TopEnd), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                if (hasPeople) Control(R.drawable.ic_people, "tree.people", stringResource(R.string.all_people), onPeople)
                Control(R.drawable.ic_settings, "tree.settings", stringResource(R.string.settings), onSettings)
            }
            if (hasPeople) Column(Modifier.align(Alignment.BottomEnd), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Box {
                    Control(R.drawable.ic_swap_vert, "tree.generationLimits", stringResource(R.string.generation_limits),
                        { menu = true }, enabled = maxAbove > 0 || maxBelow > 0)
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        DropdownMenuItem(text = { Text(stringResource(R.string.all_levels)) }, onClick = {
                            onLimits(TreeGenerationLimits()); menu = false
                        }, modifier = Modifier.semantics { selected = limits.isUnlimited })
                        (0..maxAbove).forEach { value -> DropdownMenuItem(
                            text = { Text(stringResource(R.string.levels_above_value, value)) },
                            onClick = { onLimits(limits.copy(ancestorLevels = value)); menu = false },
                            modifier = Modifier.semantics { selected = limits.ancestorLevels == value }
                                .testTag("tree.generationLimits.ancestors.$value"),
                        ) }
                        (0..maxBelow).forEach { value -> DropdownMenuItem(
                            text = { Text(stringResource(R.string.levels_below_value, value)) },
                            onClick = { onLimits(limits.copy(descendantLevels = value)); menu = false },
                            modifier = Modifier.semantics { selected = limits.descendantLevels == value }
                                .testTag("tree.generationLimits.descendants.$value"),
                        ) }
                    }
                }
                Control(R.drawable.ic_zoom_in, "tree.zoomIn", stringResource(R.string.zoom_in), onZoomIn)
                Control(R.drawable.ic_zoom_out, "tree.zoomOut", stringResource(R.string.zoom_out), onZoomOut)
                Control(R.drawable.ic_center_focus_strong, "tree.fit", stringResource(R.string.show_all_people), onFit)
            }
        }
        if (hasPeople) Control(
            if (showControls) R.drawable.ic_visibility else R.drawable.ic_visibility_off,
            "tree.toggleControls",
            stringResource(if (showControls) R.string.hide_controls else R.string.show_controls),
            onToggle,
            Modifier.align(Alignment.BottomStart).semantics { stateDescription = toggleState },
        )
    }
}

@Composable
internal fun TreeNodeLabels(name: String, role: String?, lifeSummary: String?, roleColor: Color? = null) {
    val fontScale = LocalDensity.current.fontScale
    Spacer(Modifier.height(TreeVisualMetrics.NodeLabelTopSpacing.dp))
    Text(
        name,
        fontSize = fixedLogicalTextSp(16f, fontScale).sp,
        lineHeight = fixedLogicalTextSp(20f, fontScale).sp,
        fontWeight = FontWeight.Bold,
        maxLines = 1,
        autoSize = TextAutoSize.StepBased(
            minFontSize = fixedLogicalTextSp(16f * .55f, fontScale).sp,
            maxFontSize = fixedLogicalTextSp(16f, fontScale).sp,
        ),
        textAlign = TextAlign.Center,
    )
    role?.let {
        Text(
            it,
            color = roleColor ?: MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = fixedLogicalTextSp(13f, fontScale).sp,
            lineHeight = fixedLogicalTextSp(20f, fontScale).sp,
            maxLines = 1,
            autoSize = TextAutoSize.StepBased(
                minFontSize = fixedLogicalTextSp(13f * .7f, fontScale).sp,
                maxFontSize = fixedLogicalTextSp(13f, fontScale).sp,
            ),
        )
    }
    lifeSummary?.let {
        Text(
            it,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = fixedLogicalTextSp(11f, fontScale).sp,
            lineHeight = fixedLogicalTextSp(16f, fontScale).sp,
            maxLines = 1,
        )
    }
}

internal fun fixedLogicalTextSp(logicalDp: Float, fontScale: Float): Float {
    require(fontScale > 0f)
    return logicalDp / fontScale
}

@Composable
internal fun TreeRoutingWarning(modifier: Modifier = Modifier) {
    Text(
        stringResource(R.string.tree_routing_warning),
        color = MaterialTheme.colorScheme.onErrorContainer,
        style = MaterialTheme.typography.bodyMedium,
        textAlign = TextAlign.Center,
        modifier = modifier.padding(horizontal = 72.dp, vertical = 16.dp)
            .background(MaterialTheme.colorScheme.errorContainer, RoundedCornerShape(12.dp))
            .padding(horizontal = 16.dp, vertical = 12.dp)
            .semantics { liveRegion = LiveRegionMode.Polite }
            .testTag("tree.routingWarning"),
    )
}

@Composable
private fun Control(
    icon: Int, tag: String, label: String, action: () -> Unit,
    modifier: Modifier = Modifier, enabled: Boolean = true,
) {
    TextButton(
        onClick = action,
        enabled = enabled,
        contentPadding = PaddingValues(0.dp),
        modifier = modifier.size(48.dp).background(MaterialTheme.colorScheme.surface.copy(alpha = .96f), CircleShape)
            .border(1.dp, MaterialTheme.colorScheme.outline, CircleShape).testTag(tag)
            .semantics { contentDescription = label },
    ) { Icon(painterResource(icon), contentDescription = null, modifier = Modifier.size(22.dp)) }
}
