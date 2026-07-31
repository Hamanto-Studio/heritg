package tech.robihamanto.heritg.android

import android.graphics.Bitmap
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

internal interface MemoryOnlyValue {
    fun clearMemory()
}

internal class AppUiState : ViewModel() {
    var showLibrary by mutableStateOf<Boolean?>(null)
    var overlay by mutableStateOf<Overlay?>(null)
        private set
    var message by mutableStateOf<String?>(null)
    var importCompleted by mutableStateOf(false)
    var navigationInitialized by mutableStateOf(false)
    var selectedTreeIdOverride by mutableStateOf<String?>(null)

    private val retained = mutableMapOf<String, MutableState<*>>()

    @Suppress("UNCHECKED_CAST")
    fun <T> state(key: String, initial: () -> T): MutableState<T> =
        retained.getOrPut(key) { mutableStateOf(initial()) } as MutableState<T>

    fun show(value: Overlay) {
        if (overlay !== value) clearOverlayMemory(overlay)
        overlay = value
    }

    fun closeOverlay() {
        val closing = overlay
        overlay = null
        when (closing) {
            is Overlay.Password -> {
                closing.data.fill(0)
                clear("password:")
            }
            is Overlay.Settings -> clear("settings:${closing.treeId}:")
            is Overlay.Edit -> clear("editor:${closing.personId}:")
            is Overlay.Add -> clear("add:${closing.personId}:")
            is Overlay.Link -> clear("link:${closing.personId}:")
            Overlay.FirstPerson -> clear("firstPerson:")
            Overlay.People -> clear("people:")
            null -> Unit
        }
    }

    fun clear(prefix: String) {
        retained.keys.filter { it.startsWith(prefix) }.forEach { key ->
            retained.remove(key)?.value?.let(::wipe)
        }
    }

    fun launch(block: suspend CoroutineScope.() -> Unit): Job = viewModelScope.launch(block = block)

    override fun onCleared() {
        clearOverlayMemory(overlay)
        retained.values.forEach { wipe(it.value) }
        retained.clear()
    }

    private fun clearOverlayMemory(value: Overlay?) {
        if (value is Overlay.Password) {
            value.data.fill(0)
            clear("password:")
        }
    }

    private fun wipe(value: Any?) {
        when (value) {
            is ByteArray -> value.fill(0)
            is Bitmap -> if (!value.isRecycled) value.recycle()
            is MemoryOnlyValue -> value.clearMemory()
        }
    }
}
