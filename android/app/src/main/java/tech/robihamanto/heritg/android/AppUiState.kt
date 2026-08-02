package tech.robihamanto.heritg.android

import android.graphics.Bitmap
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import tech.robihamanto.heritg.android.core.tree.TreeGenerationLimits

internal interface MemoryOnlyValue {
    fun clearMemory()
}

internal class AppUiState(private val savedStateHandle: SavedStateHandle) : ViewModel() {
    private var routes by mutableStateOf(
        savedStateHandle.get<ArrayList<String>>(RoutesKey)?.toList().orEmpty(),
    )
    val navigationInitialized: Boolean get() = routes.isNotEmpty()
    val libraryVisible: Boolean get() = routes.lastOrNull() == LibraryRoute
    val canNavigateBack: Boolean get() = routes.size > 1
    val activeTreeId: String? get() = routes.lastOrNull { it.startsWith(TreeRoutePrefix) }
        ?.removePrefix(TreeRoutePrefix)
    var overlay by mutableStateOf(decodeOverlay(savedStateHandle.get<ArrayList<String>>(OverlayKey)))
        private set
    var message by mutableStateOf<String?>(null)
    var importCompleted by mutableStateOf(false)
    var selectedTreeIdOverride by mutableStateOf<String?>(null)

    private val retained = mutableMapOf<String, MutableState<*>>()
    private val memoryOnlyPrefixes = mutableSetOf<String>()

    @Suppress("UNCHECKED_CAST")
    fun <T> state(key: String, initial: () -> T): MutableState<T> = retained.getOrPut(key) {
        val initialValue = initial()
        val supportsEnum = initialValue is Enum<*>
        PersistedMutableState(restoredValue(key, initialValue)) { value -> persistValue(key, value, supportsEnum) }
    } as MutableState<T>

    fun show(value: Overlay) {
        if (overlay !== value) clearOverlayMemory(overlay)
        overlay = value
        encodeOverlay(value)?.let { savedStateHandle[OverlayKey] = it }
            ?: savedStateHandle.remove<ArrayList<String>>(OverlayKey)
    }

    fun initializeNavigation(treeId: String?) {
        if (navigationInitialized) return
        updateRoutes(listOf(treeId?.let(::treeRoute) ?: LibraryRoute))
    }

    fun openLibrary() {
        if (libraryVisible) return
        updateRoutes(routes + LibraryRoute)
    }

    fun openTree(treeId: String, keepLibraryPane: Boolean = false) {
        selectedTreeIdOverride = treeId
        if (keepLibraryPane && libraryVisible) {
            val underlyingTree = routes.indexOfLast { it.startsWith(TreeRoutePrefix) }
            val updated = routes.toMutableList()
            if (underlyingTree >= 0) updated[underlyingTree] = treeRoute(treeId)
            else updated.add(0, treeRoute(treeId))
            updateRoutes(updated)
        } else if (routes.lastOrNull() != treeRoute(treeId)) {
            updateRoutes(routes + treeRoute(treeId))
        }
    }

    fun toggleLibrary() {
        if (libraryVisible) navigateBack() else openLibrary()
    }

    fun navigateBack(): Boolean {
        if (!canNavigateBack) return false
        updateRoutes(routes.dropLast(1))
        return true
    }

    fun removeTree(treeId: String, fallbackTreeId: String?) {
        val remaining = routes.filterNot { it == treeRoute(treeId) }
        val withFallback = if (fallbackTreeId != null && remaining.none { it.startsWith(TreeRoutePrefix) }) {
            if (remaining.lastOrNull() == LibraryRoute) {
                remaining.dropLast(1) + treeRoute(fallbackTreeId) + LibraryRoute
            } else remaining + treeRoute(fallbackTreeId)
        } else remaining
        updateRoutes(
            when {
                withFallback.isNotEmpty() -> withFallback
                fallbackTreeId != null -> listOf(treeRoute(fallbackTreeId))
                else -> listOf(LibraryRoute)
            },
        )
    }

    fun reconcileTrees(validTreeIds: Set<String>, fallbackTreeId: String?) {
        if (!navigationInitialized) return
        val validRoutes = routes.filter { route ->
            route == LibraryRoute || route.removePrefix(TreeRoutePrefix) in validTreeIds
        }
        if (validRoutes != routes) {
            updateRoutes(validRoutes.ifEmpty { listOf(fallbackTreeId?.let(::treeRoute) ?: LibraryRoute) })
        }
    }

    fun closeOverlay() {
        val closing = overlay
        overlay = null
        savedStateHandle.remove<ArrayList<String>>(OverlayKey)
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
        memoryOnlyPrefixes.remove(prefix)
        retained.keys.filter { it.startsWith(prefix) }.forEach { key ->
            retained.remove(key)?.value?.let(::wipe)
        }
        savedStateHandle.keys().filter { it.startsWith(prefix) }.forEach { key ->
            savedStateHandle.remove<Any?>(key)
        }
    }

    fun keepDraftInMemory(prefix: String) {
        memoryOnlyPrefixes += prefix
        savedStateHandle.keys().filter { it.startsWith(prefix) }.forEach { key ->
            savedStateHandle.remove<Any?>(key)
        }
        savedStateHandle.remove<ArrayList<String>>(OverlayKey)
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

    private fun updateRoutes(value: List<String>) {
        val normalized = value.fold(mutableListOf<String>()) { result, route ->
            if (result.lastOrNull() != route) result.add(route)
            result
        }
        routes = normalized
        savedStateHandle[RoutesKey] = ArrayList(normalized)
    }

    private fun treeRoute(treeId: String) = "$TreeRoutePrefix$treeId"

    @Suppress("UNCHECKED_CAST")
    private fun <T> restoredValue(key: String, initialValue: T): T {
        if (!isPersistable(key)) {
            savedStateHandle.remove<Any?>(key)
            return initialValue
        }
        if (!savedStateHandle.contains(key)) return initialValue
        val saved = savedStateHandle.get<Any?>(key)
        if (initialValue is Enum<*> && saved is String) {
            return initialValue.javaClass.enumConstants
                ?.firstOrNull { (it as Enum<*>).name == saved } as? T ?: initialValue
        }
        return saved as? T ?: initialValue
    }

    private fun persistValue(key: String, value: Any?, supportsEnum: Boolean) {
        if (!isPersistable(key)) {
            savedStateHandle.remove<Any?>(key)
            return
        }
        when (value) {
            null, is String, is Boolean, is Int, is Long, is Float, is Double -> savedStateHandle[key] = value
            is Enum<*> -> if (supportsEnum) savedStateHandle[key] = value.name
        }
    }

    private fun isPersistable(key: String): Boolean {
        val normalized = key.lowercase()
        return memoryOnlyPrefixes.none(key::startsWith) &&
            !normalized.contains("password") && !normalized.contains("confirmation") &&
            !normalized.contains("photo") && !normalized.contains("generatedarchive") &&
            !normalized.endsWith(":role") && !normalized.endsWith(":working")
    }

    private fun encodeOverlay(value: Overlay): ArrayList<String>? = when (value) {
        Overlay.People -> arrayListOf("people")
        Overlay.FirstPerson -> arrayListOf("firstPerson")
        is Overlay.Add -> arrayListOf("add", value.personId)
        is Overlay.Link -> arrayListOf("link", value.personId)
        is Overlay.Edit -> arrayListOf("edit", value.personId)
        is Overlay.Settings -> arrayListOf(
            "settings", value.treeId,
            value.generationLimits.ancestorLevels?.toString().orEmpty(),
            value.generationLimits.descendantLevels?.toString().orEmpty(),
        )
        is Overlay.Password -> null
    }

    private fun decodeOverlay(value: ArrayList<String>?): Overlay? = when (value?.firstOrNull()) {
        "people" -> Overlay.People
        "firstPerson" -> Overlay.FirstPerson
        "add" -> value.getOrNull(1)?.let { Overlay.Add(it) }
        "link" -> value.getOrNull(1)?.let { Overlay.Link(it) }
        "edit" -> value.getOrNull(1)?.let { Overlay.Edit(it) }
        "settings" -> value.getOrNull(1)?.let { treeId ->
            Overlay.Settings(
                treeId,
                TreeGenerationLimits(value.getOrNull(2)?.toIntOrNull(), value.getOrNull(3)?.toIntOrNull()),
            )
        }
        else -> null
    }

    private companion object {
        const val RoutesKey = "navigation.routes"
        const val OverlayKey = "navigation.overlay"
        const val LibraryRoute = "library"
        const val TreeRoutePrefix = "tree:"
    }
}

private class PersistedMutableState<T>(
    initialValue: T,
    private val onChanged: (T) -> Unit,
) : MutableState<T> {
    private val delegate = mutableStateOf(initialValue)

    override var value: T
        get() = delegate.value
        set(value) {
            delegate.value = value
            onChanged(value)
        }

    override fun component1(): T = value
    override fun component2(): (T) -> Unit = { value = it }
}
