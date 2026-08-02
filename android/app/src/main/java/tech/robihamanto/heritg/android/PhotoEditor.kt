package tech.robihamanto.heritg.android

import android.graphics.Bitmap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlin.math.max

@Composable
internal fun PhotoEditor(
    personName: String, data: ByteArray?, uiState: AppUiState, key: String, onData: (ByteArray?) -> Unit,
) {
    val context = LocalContext.current
    var source by uiState.state<Bitmap?>(key + "source") { null }
    var error by uiState.state<String?>(key + "error") { null }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        uri?.let { selected -> uiState.launch {
            runCatching {
                val bytes = LocalFiles.read(context.contentResolver, selected, 32 * 1024 * 1024)
                withContext(Dispatchers.Default) { PhotoTools.decode(bytes, 2048) }
                    ?: throw PhotoEditException.InvalidImage
            }.onSuccess { source = it; error = null }.onFailure { error = context.localizedError(it) }
        } }
    }
    Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
        val preview by rememberPhotoThumbnail(
            key + "preview", data, with(LocalDensity.current) { 104.dp.roundToPx() },
        )
        Box(Modifier.size(104.dp).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) {
            preview?.let { bitmap -> Image(
                bitmap.asImageBitmap(), stringResource(R.string.profile_photo_of, personName),
                Modifier.size(104.dp), contentScale = ContentScale.Crop,
            ) } ?: Text(personName.take(1).uppercase())
        }
        Row {
            TextButton(onClick = { picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                modifier = Modifier.testTag("person.photo.choose")) {
                Text(stringResource(if (data == null) R.string.add_photo else R.string.change_photo))
            }
            if (data != null) TextButton(onClick = { onData(null) }, modifier = Modifier.testTag("person.photo.remove")) {
                Text(stringResource(R.string.remove_photo))
            }
        }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.testTag("person.photo.error")) }
    }
    source?.let { bitmap -> CropDialog(bitmap, uiState, key + "crop:", onDismiss = { bitmap.recycle(); source = null }, onUse = {
        onData(it); bitmap.recycle(); source = null
    }) }
}

@Composable
private fun CropDialog(
    bitmap: Bitmap, uiState: AppUiState, key: String, onDismiss: () -> Unit, onUse: (ByteArray) -> Unit,
) {
    val context = LocalContext.current
    var zoom by uiState.state(key + "zoom") { 1f }
    var x by uiState.state(key + "x") { 0f }
    var y by uiState.state(key + "y") { 0f }
    var viewport by uiState.state(key + "viewport") { 0f }
    var working by uiState.state(key + "working") { false }
    var error by uiState.state<String?>(key + "error") { null }
    val cropDescription = stringResource(R.string.square_photo_crop)
    val zoomDescription = stringResource(R.string.zoom_percent, (zoom * 100).toInt())
    fun clampOffset(value: Float, dimension: Int, currentZoom: Float): Float {
        if (viewport <= 0) return 0f
        val baseScale = max(viewport / bitmap.width, viewport / bitmap.height)
        val maximum = max(dimension * baseScale * currentZoom - viewport, 0f) / 2
        return value.coerceIn(-maximum, maximum)
    }
    fun applyZoom(value: Float) {
        zoom = value.coerceIn(1f, 4f)
        x = clampOffset(x, bitmap.width, zoom)
        y = clampOffset(y, bitmap.height, zoom)
    }
    AlertDialog(
        onDismissRequest = { if (!working) onDismiss() }, title = { Text(stringResource(R.string.crop_photo)) },
        text = { Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(stringResource(R.string.crop_instructions))
            Box(
                Modifier.size(280.dp).clip(RoundedCornerShape(18.dp)).background(MaterialTheme.colorScheme.surfaceVariant).onSizeChanged {
                    viewport = minOf(it.width, it.height).toFloat()
                }
                    .pointerInput(bitmap) { detectTransformGestures { _, pan, change, _ ->
                        applyZoom(zoom * change)
                        x = clampOffset(x + pan.x, bitmap.width, zoom)
                        y = clampOffset(y + pan.y, bitmap.height, zoom)
                    } }.semantics {
                        contentDescription = cropDescription
                        stateDescription = zoomDescription
                    }, contentAlignment = Alignment.Center,
            ) {
                Image(
                    bitmap.asImageBitmap(), null, Modifier.size(280.dp).graphicsLayer {
                        scaleX = zoom; scaleY = zoom; translationX = x; translationY = y
                    }, contentScale = ContentScale.Crop,
                )
            }
            Text(stringResource(R.string.zoom_percent, (zoom * 100).toInt()))
            Slider(value = zoom, onValueChange = ::applyZoom, valueRange = 1f..4f,
                modifier = Modifier.testTag("person.photo.crop.zoom"))
            Button(onClick = { zoom = 1f; x = 0f; y = 0f }, modifier = Modifier.testTag("person.photo.crop.reset")) {
                Text(stringResource(R.string.reset_photo))
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.testTag("person.photo.crop.error")) }
        } },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !working) { Text(stringResource(R.string.cancel)) } },
        confirmButton = { TextButton(onClick = { uiState.launch {
            working = true
            runCatching { withContext(Dispatchers.Default) { PhotoTools.crop(bitmap, zoom, x, y, viewport) } }
                .onSuccess(onUse).onFailure { error = context.localizedError(it) }
            working = false
        } }, enabled = !working && viewport > 0,
            modifier = Modifier.testTag("person.photo.crop.use")) {
            Text(stringResource(if (working) R.string.processing_photo else R.string.use_photo))
        } },
    )
}
