package tech.robihamanto.heritg.android

import android.os.Bundle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.width
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.core.os.LocaleListCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.withContext
import tech.robihamanto.heritg.android.core.data.AppPreferences
import tech.robihamanto.heritg.android.core.data.FamilyRepository
import tech.robihamanto.heritg.android.core.interop.ArchiveProtection
import tech.robihamanto.heritg.android.core.interop.GedcomImporter
import tech.robihamanto.heritg.android.core.interop.HeritgArchiveCodec
import tech.robihamanto.heritg.android.core.model.FamilyTree

class MainActivity : AppCompatActivity() {
    private val uiState by viewModels<AppUiState>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val app = application as HeritgApplication
        setContentView(androidx.compose.ui.platform.ComposeView(this).apply {
            setContent { HeritgApp(app.familyRepository, app.preferences, uiState) }
        })
    }
}

internal sealed interface Overlay {
    data object People : Overlay
    data class Settings(val treeId: String) : Overlay
    data object FirstPerson : Overlay
    data class Add(val personId: String) : Overlay
    data class Link(val personId: String) : Overlay
    data class Edit(val personId: String) : Overlay
    data class Password(val data: ByteArray, val sourceName: String) : Overlay
}

@Composable
private fun HeritgApp(repository: FamilyRepository, preferences: AppPreferences, uiState: AppUiState) {
    val trees by repository.observeTrees().collectAsStateWithLifecycle(emptyList())
    val storedTreeId by preferences.selectedTreeId.collectAsStateWithLifecycle(null)
    val storedLanguage by preferences.languageTag.collectAsStateWithLifecycle(null)
    val selectedTreeId = uiState.selectedTreeIdOverride ?: storedTreeId
    val selectedTree = trees.firstOrNull { it.id == selectedTreeId } ?: trees.firstOrNull()
    val peopleFlow = remember(selectedTree?.id) {
        selectedTree?.id?.let(repository::observePeople) ?: flowOf(emptyList())
    }
    val relationshipsFlow = remember(selectedTree?.id) {
        selectedTree?.id?.let(repository::observeRelationships) ?: flowOf(emptyList())
    }
    val people by peopleFlow.collectAsStateWithLifecycle(emptyList())
    val relationships by relationshipsFlow.collectAsStateWithLifecycle(emptyList())
    val context = LocalContext.current
    val resources = LocalResources.current
    val codec = remember { HeritgArchiveCodec() }
    val showLibrary = uiState.showLibrary ?: (selectedTree == null)

    fun showError(error: Throwable) {
        uiState.importCompleted = false
        uiState.message = context.localizedError(error)
    }

    fun openTree(tree: FamilyTree) {
        uiState.selectedTreeIdOverride = tree.id
        uiState.launch { preferences.setSelectedTreeId(tree.id) }
        uiState.showLibrary = false
    }

    suspend fun importBytes(bytes: ByteArray, name: String) {
        runCatching {
            val imported = withContext(Dispatchers.Default) { GedcomImporter.parse(bytes, name) }
            val tree = repository.importPayload(imported.archivePayload())
            openTree(tree)
            if (imported.warnings.isNotEmpty()) {
                val peopleText = resources.getQuantityString(
                    R.plurals.people_count, imported.people.size, imported.people.size,
                )
                val warningText = resources.getQuantityString(
                    R.plurals.warnings_count, imported.warnings.size, imported.warnings.size,
                )
                uiState.message = resources.getString(
                    R.string.imported_with_warnings,
                    peopleText,
                    warningText,
                    imported.warnings.take(3).joinToString("\n", transform = context::localizedGedcomWarning),
                )
                uiState.importCompleted = true
            }
        }.onFailure(::showError)
    }

    suspend fun restoreArchive(bytes: ByteArray, password: String? = null): FamilyTree {
        val payload = withContext(Dispatchers.Default) { codec.decode(bytes, password) }
        return repository.importPayload(payload)
    }

    val gedcomPicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri?.let { selected -> uiState.launch {
            var bytes: ByteArray? = null
            try {
                val selectedBytes = LocalFiles.read(context.contentResolver, selected, GedcomImporter.MaximumBytes)
                bytes = selectedBytes
                val name = LocalFiles.displayName(context.contentResolver, selected) ?: "Imported Family Tree.ged"
                importBytes(selectedBytes, name)
            } catch (error: Throwable) {
                showError(error)
            } finally {
                bytes?.fill(0)
            }
        } }
    }
    val archivePicker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri?.let { selected -> uiState.launch {
            var bytes: ByteArray? = null
            var retained = false
            try {
                val name = LocalFiles.displayName(context.contentResolver, selected) ?: selected.lastPathSegment.orEmpty()
                if (!name.endsWith(".heritg", ignoreCase = true)) throw LocalFileException.WrongExtension
                val selectedBytes = LocalFiles.read(context.contentResolver, selected, 32 * 1024 * 1024)
                bytes = selectedBytes
                if (withContext(Dispatchers.Default) { codec.protection(selectedBytes) } == ArchiveProtection.ENCRYPTED) {
                    retained = true
                    uiState.show(Overlay.Password(selectedBytes, name))
                } else {
                    runCatching { restoreArchive(selectedBytes) }.onSuccess(::openTree).onFailure(::showError)
                }
            } catch (error: Throwable) {
                showError(error)
            } finally {
                if (!retained) bytes?.fill(0)
            }
        } }
    }

    LaunchedEffect(selectedTree?.id, selectedTreeId) {
        if (selectedTree != null && selectedTree.id != selectedTreeId) {
            uiState.selectedTreeIdOverride = selectedTree.id
            preferences.setSelectedTreeId(selectedTree.id)
        }
    }
    LaunchedEffect(trees, storedTreeId) {
        if (!uiState.navigationInitialized && trees.isNotEmpty()) {
            uiState.showLibrary = selectedTree == null
            uiState.navigationInitialized = true
        }
    }
    LaunchedEffect(storedLanguage) {
        val language = storedLanguage ?: return@LaunchedEffect
        if (AppCompatDelegate.getApplicationLocales().toLanguageTags() != language) {
            AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(language))
        }
    }

    fun deletedTree(tree: FamilyTree, fallbackId: String?) {
        if (tree.id == selectedTreeId || tree.id == selectedTree?.id) {
            uiState.selectedTreeIdOverride = fallbackId
            uiState.launch { preferences.setSelectedTreeId(fallbackId) }
        }
        if (fallbackId == null) uiState.showLibrary = true
    }

    HeritgTheme {
        Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            BoxWithConstraints {
                val expanded = maxWidth >= 840.dp
                if (expanded) {
                    Row(Modifier.fillMaxSize()) {
                        if (showLibrary || selectedTree == null) LibraryScreen(
                            trees = trees, selectedTreeId = selectedTree?.id,
                            repository = repository, uiState = uiState,
                            modifier = if (selectedTree == null) Modifier.fillMaxSize() else Modifier.width(340.dp),
                            onOpen = ::openTree, onImportGedcom = { gedcomPicker.launch(arrayOf("text/*", "application/octet-stream")) },
                            onImportArchive = { archivePicker.launch(LocalFiles.ArchiveMimeTypes) },
                            onExport = { tree -> uiState.show(Overlay.Settings(tree.id)) },
                            onDeleted = ::deletedTree,
                        )
                        if (selectedTree != null) TreeHost(selectedTree, people, relationships, repository,
                            uiState = uiState, onLibrary = { uiState.showLibrary = !showLibrary }, onOverlay = uiState::show)
                    }
                } else if (selectedTree == null || showLibrary) {
                    BackHandler(enabled = selectedTree != null) { uiState.showLibrary = false }
                    LibraryScreen(
                        trees = trees, selectedTreeId = selectedTree?.id, repository = repository, uiState = uiState,
                        onOpen = ::openTree, onImportGedcom = { gedcomPicker.launch(arrayOf("text/*", "application/octet-stream")) },
                        onImportArchive = { archivePicker.launch(LocalFiles.ArchiveMimeTypes) },
                        onExport = { tree -> uiState.showLibrary = false; uiState.show(Overlay.Settings(tree.id)) },
                        onDeleted = ::deletedTree,
                        onClose = selectedTree?.let { { uiState.showLibrary = false } },
                    )
                } else {
                    TreeHost(selectedTree, people, relationships, repository,
                        uiState = uiState, onLibrary = { uiState.showLibrary = true }, onOverlay = uiState::show)
                }
            }
        }
        AppOverlay(
            overlay = uiState.overlay, tree = selectedTree, people = people, relationships = relationships,
            repository = repository, codec = codec, uiState = uiState, onClose = uiState::closeOverlay,
            restoreArchive = { data, password -> restoreArchive(data, password) },
            onArchiveRestored = ::openTree,
            onLanguage = { tag ->
                uiState.launch { preferences.setLanguageTag(tag) }
                AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(tag))
            },
        )
        uiState.message?.let { text ->
            AlertDialog(
                onDismissRequest = { uiState.message = null }, title = { Text(stringResource(
                    if (uiState.importCompleted) R.string.import_completed else R.string.could_not_complete,
                )) },
                text = { Text(text) }, confirmButton = { TextButton(onClick = { uiState.message = null }) { Text(stringResource(R.string.ok)) } },
            )
        }
    }
}
