package tech.robihamanto.heritg.android

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import tech.robihamanto.heritg.android.core.data.FamilyRepository
import tech.robihamanto.heritg.android.core.model.FamilyTree

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun LibraryScreen(
    trees: List<FamilyTree>,
    selectedTreeId: String?,
    repository: FamilyRepository,
    uiState: AppUiState,
    modifier: Modifier = Modifier,
    onOpen: (FamilyTree) -> Unit,
    onImportGedcom: () -> Unit,
    onImportArchive: () -> Unit,
    onExport: (FamilyTree) -> Unit,
    onDeleted: (FamilyTree, String?) -> Unit,
    onClose: (() -> Unit)? = null,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var query by uiState.state("library:query") { "" }
    var createName by uiState.state<String?>("library:createName") { null }
    var rename by uiState.state<FamilyTree?>("library:rename") { null }
    var renameText by uiState.state("library:renameText") { "" }
    var deleting by uiState.state<FamilyTree?>("library:deleting") { null }
    var addMenu by uiState.state("library:addMenu") { false }
    var error by uiState.state<String?>("library:error") { null }
    val baseName = stringResource(R.string.my_family_tree)
    val addTreeDescription = stringResource(R.string.add_family_tree)
    val suggested = remember(trees, baseName) {
        if (trees.none { it.title == baseName }) baseName else generateSequence(2) { it + 1 }
            .map { "$baseName $it" }.first { candidate -> trees.none { it.title == candidate } }
    }
    val filtered = trees.sortedByDescending { it.updatedAt }.filter {
        query.isBlank() || it.title.contains(query.trim(), ignoreCase = true)
    }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = { TopAppBar(
            title = { Text(stringResource(R.string.family_trees)) },
            navigationIcon = { onClose?.let { close -> TextButton(onClick = close,
                modifier = Modifier.testTag("trees.close")) { Text(stringResource(R.string.done)) } } },
            actions = {
                if (trees.isNotEmpty()) {
                    TextButton(
                        onClick = { addMenu = true },
                        modifier = Modifier.sizeIn(minWidth = 48.dp, minHeight = 48.dp)
                            .semantics { contentDescription = addTreeDescription }.testTag("trees.add"),
                    ) { Text("+") }
                    DropdownMenu(expanded = addMenu, onDismissRequest = { addMenu = false }) {
                        DropdownMenuItem(text = { Text(stringResource(R.string.new_family_tree)) }, onClick = {
                            addMenu = false; createName = suggested
                        }, modifier = Modifier.testTag("trees.create.menu"))
                        DropdownMenuItem(text = { Text(stringResource(R.string.import_gedcom)) }, onClick = {
                            addMenu = false; onImportGedcom()
                        }, modifier = Modifier.testTag("trees.import"))
                        DropdownMenuItem(text = { Text(stringResource(R.string.restore_backup)) }, onClick = {
                            addMenu = false; onImportArchive()
                        }, modifier = Modifier.testTag("trees.importHeritg"))
                    }
                }
            },
        ) },
        containerColor = MaterialTheme.colorScheme.background,
    ) { padding ->
        Column(Modifier.padding(padding).padding(horizontal = 16.dp)) {
            OutlinedTextField(
                value = query, onValueChange = { query = it }, modifier = Modifier.fillMaxWidth().testTag("trees.search"),
                label = { Text(stringResource(R.string.search_family_trees)) }, singleLine = true,
            )
            if (trees.isEmpty()) {
                Column(
                    Modifier.fillMaxSize().padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.Center,
                ) {
                    Text("♧", style = MaterialTheme.typography.displayMedium, color = MaterialTheme.colorScheme.primary)
                    Text(stringResource(R.string.start_family_archive), style = MaterialTheme.typography.headlineSmall)
                    Spacer(Modifier.height(8.dp))
                    Text(stringResource(R.string.library_privacy), color = MaterialTheme.colorScheme.primary)
                    Spacer(Modifier.height(20.dp))
                    Button(onClick = { createName = suggested }, modifier = Modifier.testTag("trees.create.empty")) {
                        Text(stringResource(R.string.create_family_tree))
                    }
                    OutlinedButton(onClick = onImportGedcom, modifier = Modifier.testTag("trees.import")) {
                        Text(stringResource(R.string.import_gedcom))
                    }
                    OutlinedButton(onClick = onImportArchive, modifier = Modifier.testTag("trees.importHeritg")) {
                        Text(stringResource(R.string.restore_backup))
                    }
                }
            } else LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                item { Spacer(Modifier.height(4.dp)) }
                items(filtered, key = { it.id }) { tree ->
                    TreeRow(
                        tree, tree.id == selectedTreeId, repository, onOpen,
                        onRename = { rename = tree; renameText = tree.title },
                        onExport = { onExport(tree) }, onDelete = { deleting = tree },
                    )
                }
                item { Spacer(Modifier.height(16.dp)) }
            }
        }
    }
    createName?.let { initial -> NameDialog(
        title = stringResource(R.string.new_family_tree), value = initial, onValue = { createName = it },
        confirm = stringResource(R.string.create), tag = "trees.create.confirm",
        onDismiss = { createName = null }, onConfirm = { name -> scope.launch {
            runCatching { repository.createTree(name) }.onSuccess { createName = null; onOpen(it) }
                .onFailure { error = context.localizedError(it) }
        } },
    ) }
    rename?.let { tree -> NameDialog(
        title = stringResource(R.string.rename_family_tree), value = renameText, onValue = { renameText = it },
        confirm = stringResource(R.string.save), tag = "trees.rename.confirm",
        onDismiss = { rename = null }, onConfirm = { name -> scope.launch {
            runCatching { repository.renameTree(tree.id, name) }.onSuccess { rename = null }
                .onFailure { error = context.localizedError(it) }
        } },
    ) }
    deleting?.let { tree ->
        val counts by remember(tree.id) { repository.observeTreeCounts(tree.id) }
            .collectAsStateWithLifecycle(0 to 0)
        AlertDialog(
            onDismissRequest = { deleting = null },
            title = { Text(stringResource(R.string.delete_named_tree, tree.title)) },
            text = { Text(stringResource(
                R.string.delete_tree_message,
                pluralStringResource(R.plurals.people_count, counts.first, counts.first),
                pluralStringResource(R.plurals.relationships_count, counts.second, counts.second),
            )) },
            dismissButton = { TextButton(onClick = { deleting = null }) { Text(stringResource(R.string.cancel)) } },
            confirmButton = { TextButton(onClick = { scope.launch {
                runCatching { repository.deleteTree(tree.id) }
                    .onSuccess { fallback -> deleting = null; onDeleted(tree, fallback) }
                    .onFailure { error = context.localizedError(it) }
            } }, modifier = Modifier.testTag("trees.delete.confirm")) { Text(stringResource(R.string.delete_family_tree)) } },
        )
    }
    error?.let { value -> AlertDialog(
        onDismissRequest = { error = null }, title = { Text(stringResource(R.string.could_not_complete)) },
        text = { Text(value) }, confirmButton = { TextButton(onClick = { error = null }) { Text(stringResource(R.string.ok)) } },
    ) }
}

@Composable
private fun TreeRow(
    tree: FamilyTree, selected: Boolean, repository: FamilyRepository, onOpen: (FamilyTree) -> Unit,
    onRename: () -> Unit, onExport: () -> Unit, onDelete: () -> Unit,
) {
    var menu by remember { mutableStateOf(false) }
    val counts by remember(tree.id) { repository.observeTreeCounts(tree.id) }
        .collectAsStateWithLifecycle(0 to 0)
    val actionsLabel = stringResource(R.string.actions_for, tree.title)
    Row(
        Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface, RoundedCornerShape(14.dp))
            .semantics { this.selected = selected }
            .clickable(role = Role.Button) { onOpen(tree) }.testTag("trees.open.${tree.id}").padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(if (selected) "♣" else "♧", color = MaterialTheme.colorScheme.primary)
        Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
            Text(tree.title, style = MaterialTheme.typography.titleMedium)
            Text(pluralStringResource(R.plurals.people_count, counts.first, counts.first), color = MaterialTheme.colorScheme.primary)
        }
        TextButton(onClick = { menu = true }, modifier = Modifier.sizeIn(minWidth = 48.dp, minHeight = 48.dp)
            .semantics { contentDescription = actionsLabel }
            .testTag("trees.actions.${tree.id}")) { Text("⋮") }
        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
            DropdownMenuItem(text = { Text(stringResource(R.string.rename)) }, onClick = { menu = false; onRename() })
            DropdownMenuItem(text = { Text(stringResource(R.string.export)) }, onClick = { menu = false; onExport() })
            DropdownMenuItem(text = { Text(stringResource(R.string.delete)) }, onClick = { menu = false; onDelete() })
        }
    }
}

@Composable
private fun NameDialog(
    title: String, value: String, onValue: (String) -> Unit, confirm: String, tag: String,
    onDismiss: () -> Unit, onConfirm: (String) -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss, title = { Text(title) },
        text = { OutlinedTextField(value, onValue, label = { Text(stringResource(R.string.family_tree_name)) }, singleLine = true) },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) } },
        confirmButton = { TextButton(onClick = { onConfirm(value) }, enabled = value.isNotBlank(),
            modifier = Modifier.testTag(tag)) { Text(confirm) } },
    )
}
