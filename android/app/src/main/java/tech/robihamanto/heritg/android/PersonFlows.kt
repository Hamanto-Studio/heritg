package tech.robihamanto.heritg.android

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
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
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import tech.robihamanto.heritg.android.core.data.FamilyRepository
import tech.robihamanto.heritg.android.core.data.TreeState
import tech.robihamanto.heritg.android.core.domain.FamilyGraph
import tech.robihamanto.heritg.android.core.domain.RelativeRole
import tech.robihamanto.heritg.android.core.domain.relativeRoleFor
import tech.robihamanto.heritg.android.core.domain.relationshipEndpoints
import tech.robihamanto.heritg.android.core.interop.HeritgArchiveCodec
import tech.robihamanto.heritg.android.core.model.BirthDatePrecision
import tech.robihamanto.heritg.android.core.model.FamilyRelationship
import tech.robihamanto.heritg.android.core.model.FamilyTree
import tech.robihamanto.heritg.android.core.model.Person
import tech.robihamanto.heritg.android.core.model.PersonDetails
import tech.robihamanto.heritg.android.core.model.PersonGender
import tech.robihamanto.heritg.android.core.model.RelationshipKind
import java.time.Instant

internal data class DraftLink(val person: Person, val role: RelativeRole, val marriageDate: Instant? = null)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun AppOverlay(
    overlay: Overlay?, tree: FamilyTree?, people: List<Person>, relationships: List<FamilyRelationship>,
    repository: FamilyRepository, codec: HeritgArchiveCodec, uiState: AppUiState, onClose: () -> Unit,
    restoreArchive: suspend (ByteArray, String) -> FamilyTree,
    onArchiveRestored: (FamilyTree) -> Unit,
    onLanguage: (String) -> Unit,
) {
    if (overlay == null) return
    if (overlay is Overlay.Password) {
        ArchivePasswordDialog(overlay.data, overlay.sourceName, uiState, onClose, restoreArchive) {
            onArchiveRestored(it)
            onClose()
        }
        return
    }
    if (overlay is Overlay.Settings) {
        val state by remember(overlay.treeId) { repository.observeTree(overlay.treeId) }
            .collectAsStateWithLifecycle(TreeState(null, emptyList(), emptyList()))
        state.tree?.let { settingsTree -> Sheet(onClose) {
            SettingsFlow(
                settingsTree, state.people, state.relationships, codec, uiState, onClose, onLanguage,
            )
        } }
        return
    }
    if (tree == null) return
    val scope = rememberCoroutineScope()
    when (overlay) {
        Overlay.People -> Sheet(onClose) { PeopleList(people, tree.lastSelectedPersonId, uiState, onClose) { id ->
            scope.launch { repository.rememberSelectedPerson(tree.id, id) }; onClose()
        } }
        Overlay.FirstPerson -> FirstPersonDialog(uiState, onClose) { name, onError ->
            scope.launch { runCatching { repository.createPerson(tree.id, name) }
                .onSuccess { repository.rememberSelectedPerson(tree.id, it.id); onClose() }
                .onFailure(onError) }
        }
        is Overlay.Add -> people.firstOrNull { it.id == overlay.personId }?.let { target ->
            Sheet(onClose) { AddRelativeFlow(target, people, relationships, repository, uiState, onClose) }
        }
        is Overlay.Link -> people.firstOrNull { it.id == overlay.personId }?.let { target ->
            Sheet(onClose) { LinkFlow(target, people, relationships, repository, uiState, onClose) }
        }
        is Overlay.Edit -> people.firstOrNull { it.id == overlay.personId }?.let { person ->
            PersonEditor(person, people, relationships, repository, uiState, onClose)
        }
        is Overlay.Password -> Unit
        is Overlay.Settings -> Unit
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Sheet(onClose: () -> Unit, content: @Composable () -> Unit) {
    ModalBottomSheet(onDismissRequest = onClose, modifier = Modifier.fillMaxHeight(.94f)) { content() }
}

@Composable
private fun FirstPersonDialog(uiState: AppUiState, onClose: () -> Unit, onSave: (String, (Throwable) -> Unit) -> Unit) {
    val context = LocalContext.current
    var name by uiState.state("firstPerson:name") { "" }
    var error by uiState.state<String?>("firstPerson:error") { null }
    AlertDialog(
        onDismissRequest = onClose, title = { Text(stringResource(R.string.start_family_tree)) },
        text = { Column {
            OutlinedTextField(name, { name = it; error = null }, label = { Text(stringResource(R.string.name)) },
                modifier = Modifier.testTag("firstPerson.nameField"), singleLine = true)
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.testTag("firstPerson.error")) }
        } },
        dismissButton = { TextButton(onClick = onClose) { Text(stringResource(R.string.cancel)) } },
        confirmButton = { TextButton(onClick = { onSave(name) { error = context.localizedError(it) } },
            modifier = Modifier.testTag("firstPerson.save")) {
            Text(stringResource(R.string.add_person))
        } },
    )
}

@Composable
private fun PeopleList(
    people: List<Person>, selectedId: String?, uiState: AppUiState, onClose: () -> Unit, onSelect: (String) -> Unit,
) {
    var query by uiState.state("people:query") { "" }
    Column(Modifier.fillMaxWidth().padding(20.dp)) {
        Header(stringResource(R.string.all_people), "people.close", onClose)
        OutlinedTextField(query, { query = it }, Modifier.fillMaxWidth().testTag("people.search"),
            label = { Text(stringResource(R.string.search_people)) })
        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(people.filter { it.displayName.contains(query, true) }, key = { it.id }) { person ->
                Row(
                    Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface, RoundedCornerShape(12.dp))
                        .semantics { selected = person.id == selectedId }.clickable { onSelect(person.id) }
                        .testTag("people.row.${person.id}").padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Avatar(person)
                    Column(Modifier.padding(start = 12.dp)) {
                        Text(person.displayName, style = MaterialTheme.typography.titleMedium)
                        person.age()?.let { Text(stringResource(R.string.age_value, it), color = MaterialTheme.colorScheme.primary) }
                    }
                    if (person.id == selectedId) Text(" ✓", color = MaterialTheme.colorScheme.primary)
                }
            }
        }
    }
}

@Composable
private fun AddRelativeFlow(
    target: Person, people: List<Person>, relationships: List<FamilyRelationship>,
    repository: FamilyRepository, uiState: AppUiState, onClose: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val prefix = "add:${target.id}:"
    var role by uiState.state<RelativeRole?>(prefix + "role") { null }
    var name by uiState.state(prefix + "name") { "" }
    var birth by uiState.state(prefix + "birth") { "" }
    var city by uiState.state(prefix + "city") { "" }
    var marriage by uiState.state(prefix + "marriage") { "" }
    var coParentId by uiState.state<String?>(prefix + "coParent") { null }
    var error by uiState.state<String?>(prefix + "error") { null }
    BackHandler(enabled = role != null) { role = null; error = null }
    if (role == null) {
        LazyColumn(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item { Header(stringResource(R.string.add_to, target.displayName), "relative.cancel", onClose) }
            roleGroups().forEach { (title, roles) ->
                item { Text(stringResource(title), style = MaterialTheme.typography.titleMedium) }
                items(roles, key = { it.wireName }) { item ->
                    OutlinedButton(
                        onClick = { role = item }, modifier = Modifier.fillMaxWidth().sizeIn(minHeight = 48.dp)
                            .testTag("relative.role.${item.wireName}"),
                    ) { Text(roleTitle(item)) }
                }
            }
        }
    } else {
        val selectedRole = role!!
        val partners = FamilyGraph.activePartners(target, people, relationships)
        FormColumn {
            Header(stringResource(R.string.new_relative, roleTitle(selectedRole)), "relative.cancel", onClose)
            OutlinedTextField(name, { name = it }, Modifier.fillMaxWidth().testTag("relative.name"),
                label = { Text(stringResource(R.string.name)) })
            DateField(stringResource(R.string.birthday), birth, { birth = it }, "relative.birthDate")
            if (selectedRole.kind == RelationshipKind.PARTNER) {
                DateField(stringResource(R.string.marriage_date), marriage, { marriage = it }, "relative.marriageDate")
            }
            if (selectedRole.allowsCoParent && partners.isNotEmpty()) {
                ChoiceMenu(
                    stringResource(R.string.co_parent), coParentId?.let { id -> partners.firstOrNull { it.id == id }?.displayName }
                        ?: stringResource(R.string.no_co_parent),
                    partners.map { it.id to it.displayName }, { coParentId = it }, "relative.coParent",
                )
            }
            OutlinedTextField(city, { city = it }, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.city)) })
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.testTag("relative.error")) }
            Button(onClick = { scope.launch {
                runCatching { repository.addRelative(
                    target.id, name, selectedRole,
                     PersonDetails(birthDate = parseGenealogyDate(birth), city = city),
                    parseGenealogyDate(marriage), coParentId,
                ) }.onSuccess { onClose() }.onFailure { error = context.localizedError(it) }
            } }, modifier = Modifier.fillMaxWidth().testTag("relative.save")) { Text(stringResource(R.string.save)) }
        }
    }
}

@Composable
private fun LinkFlow(
    target: Person,
    people: List<Person>,
    relationships: List<FamilyRelationship>,
    repository: FamilyRepository,
    uiState: AppUiState,
    onClose: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val prefix = "link:${target.id}:"
    var role by uiState.state<RelativeRole?>(prefix + "role") { null }
    var error by uiState.state<String?>(prefix + "error") { null }
    BackHandler(enabled = role != null) { role = null; error = null }
    LazyColumn(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item { Header(stringResource(R.string.link_to, target.displayName), "relationship.link.cancel", onClose) }
        error?.let { item { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.testTag("relationship.link.error")) } }
        if (role == null) items(RelativeRole.entries, key = { it.wireName }) { item ->
            OutlinedButton(onClick = { role = item }, Modifier.fillMaxWidth().testTag("relationship.link.role.${item.wireName}")) {
                Text(roleTitle(item))
            }
        } else items(people.filter { candidate -> candidate.id != target.id &&
            relationshipEndpoints(target.id, candidate.id, role!!).let { endpoint -> relationships.none {
                it.kind == endpoint.kind && it.fromPersonId == endpoint.fromPersonId &&
                    it.toPersonId == endpoint.toPersonId
            } }
        }, key = { it.id }) { person ->
            Row(Modifier.fillMaxWidth().clickable { scope.launch {
                runCatching { repository.link(target.id, person.id, role!!) }.onSuccess { onClose() }
                    .onFailure { error = context.localizedError(it) }
            } }.testTag("relationship.link.person.${person.id}").padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Avatar(person); Text(person.displayName, Modifier.padding(start = 12.dp))
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PersonEditor(
    person: Person, people: List<Person>, relationships: List<FamilyRelationship>,
    repository: FamilyRepository, uiState: AppUiState, onClose: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val prefix = "editor:${person.id}:"
    var name by uiState.state(prefix + "name") { person.displayName }
    var gender by uiState.state(prefix + "gender") { person.gender }
    var birth by uiState.state(prefix + "birth") { formatGenealogyDate(person.birthDate) }
    var death by uiState.state(prefix + "death") { formatGenealogyDate(person.deathDate) }
    var city by uiState.state(prefix + "city") { person.city }
    var address by uiState.state(prefix + "address") { person.addressLine }
    var province by uiState.state(prefix + "province") { person.province }
    var country by uiState.state(prefix + "country") { person.country }
    var postal by uiState.state(prefix + "postal") { person.postalCode }
    var notes by uiState.state(prefix + "notes") { person.notes }
    var photo by uiState.state<ByteArray?>(prefix + "photo") { person.profilePhotoData?.copyOf() }
    var removed by uiState.state(prefix + "removed") { setOf<String>() }
    var pending by uiState.state(prefix + "pending") { listOf<DraftLink>() }
    var replacements by uiState.state(prefix + "replacements") { mapOf<String, DraftLink>() }
    var editing by uiState.state<Pair<FamilyRelationship, Person>?>(prefix + "editing") { null }
    var confirmDelete by uiState.state(prefix + "confirmDelete") { false }
    var confirmDiscard by uiState.state(prefix + "confirmDiscard") { false }
    var error by uiState.state<String?>(prefix + "error") { null }
    var linking by uiState.state(prefix + "linking") { false }
    val related = relationships.mapNotNull { relationship ->
        val id = when (person.id) { relationship.fromPersonId -> relationship.toPersonId; relationship.toPersonId -> relationship.fromPersonId; else -> null }
        id?.let { relativeId -> people.firstOrNull { it.id == relativeId }?.let { relationship to it } }
    }
    val dirty = name != person.displayName || gender != person.gender || city != person.city ||
        birth != formatGenealogyDate(person.birthDate) || death != formatGenealogyDate(person.deathDate) ||
        address != person.addressLine || province != person.province || country != person.country ||
        postal != person.postalCode || notes != person.notes || !photo.contentEqualsNullable(person.profilePhotoData) ||
        removed.isNotEmpty() || pending.isNotEmpty() || replacements.isNotEmpty()
    ModalBottomSheet(onDismissRequest = { if (dirty) confirmDiscard = true else onClose() },
        modifier = Modifier.fillMaxHeight(.94f)) {
      FormColumn {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = { if (dirty) confirmDiscard = true else onClose() }, modifier = Modifier.testTag("person.close")) {
                Text(stringResource(R.string.cancel))
            }
            Text(person.displayName, Modifier.weight(1f), style = MaterialTheme.typography.titleLarge)
            TextButton(onClick = { scope.launch {
                runCatching { repository.savePersonEdits(
                    person.id, name, gender,
                     PersonDetails(parseGenealogyDate(birth), parseGenealogyDate(death), BirthDatePrecision.EXACT, notes, address,
                        city, province, country, postal, photo),
                    removed + replacements.keys,
                    (pending + replacements.values).map { Triple(it.person.id, it.role, it.marriageDate) },
                ) }.onSuccess { onClose() }.onFailure { error = context.localizedError(it) }
            } }, enabled = dirty, modifier = Modifier.testTag("person.save")) { Text(stringResource(R.string.save)) }
        }
        PhotoEditor(person.displayName, photo, uiState, prefix + "photoEditor:", { photo = it })
        OutlinedTextField(name, { name = it }, Modifier.fillMaxWidth().testTag("person.nameField"), label = { Text(stringResource(R.string.name)) })
        GenderMenu(gender) { gender = it }
        DateField(stringResource(R.string.birthday), birth, { birth = it }, "person.birthDate")
        DateField(stringResource(R.string.death_date), death, { death = it }, "person.deathDate")
        listOf(
            Triple(city, R.string.city, { value: String -> city = value }),
            Triple(address, R.string.address, { value: String -> address = value }),
            Triple(province, R.string.province, { value: String -> province = value }),
            Triple(country, R.string.country, { value: String -> country = value }),
            Triple(postal, R.string.postal_code, { value: String -> postal = value }),
            Triple(notes, R.string.notes, { value: String -> notes = value }),
        ).forEach { field -> OutlinedTextField(field.first, field.third, Modifier.fillMaxWidth(), label = { Text(stringResource(field.second)) }) }
        Text(stringResource(R.string.family), style = MaterialTheme.typography.titleMedium)
        related.filter { it.first.id !in removed }.forEach { (relationship, relative) ->
            val replacement = replacements[relationship.id]
            RelationshipRow(
                person, relative, relationship, replacement,
                onEdit = { editing = relationship to relative },
                onRemove = { removed = removed + relationship.id; replacements = replacements - relationship.id },
            )
        }
        pending.forEach { draft -> Row(Modifier.fillMaxWidth().padding(8.dp)) {
            Text("${draft.person.displayName} · ${roleTitle(draft.role)}", Modifier.weight(1f));
            TextButton(onClick = { pending = pending - draft }) { Text(stringResource(R.string.remove)) }
        } }
        OutlinedButton(onClick = { linking = true }, modifier = Modifier.testTag("relationship.link")) { Text(stringResource(R.string.link_existing)) }
        if (linking) PendingLinkChooser(people.filter { candidate -> candidate.id != person.id &&
            related.none { it.first.id !in removed && it.second.id == candidate.id } &&
            pending.none { it.person.id == candidate.id } },
            uiState, prefix + "pendingLink:",
            onClose = { linking = false }, onAdd = { pending = pending + it; linking = false })
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.testTag("person.error")) }
        Button(onClick = { confirmDelete = true }, modifier = Modifier.fillMaxWidth().testTag("person.delete")) {
            Text(stringResource(R.string.remove_person))
        }
      }
    }
    if (confirmDiscard) ConfirmDialog(R.string.discard_changes, R.string.discard_message, {
        confirmDiscard = false
    }, onClose, "person.discard.confirm")
    if (confirmDelete) ConfirmDialog(R.string.remove_person, R.string.remove_person_message, {
        confirmDelete = false
    }, { scope.launch { runCatching { repository.deletePerson(person.id) }
        .onSuccess { onClose() }.onFailure { error = context.localizedError(it); confirmDelete = false } } },
        "person.delete.confirm")
    editing?.let { (relationship, relative) ->
        EditRelationshipDialog(
            person = person, relative = relative,
            initial = replacements[relationship.id] ?: DraftLink(
                relative, relativeRoleFor(relationship, relative, person.id), relationship.marriageDate,
            ),
            uiState = uiState, key = prefix + "relationship:${relationship.id}:",
            onClose = { editing = null }, onSave = { draft ->
                replacements = replacements + (relationship.id to draft); editing = null
            },
        )
    }
}

@Composable
private fun RelationshipRow(
    person: Person, relative: Person, relationship: FamilyRelationship, replacement: DraftLink?,
    onEdit: () -> Unit, onRemove: () -> Unit,
) {
    val role = replacement?.role ?: relativeRoleFor(relationship, relative, person.id)
    Column(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface, RoundedCornerShape(12.dp)).padding(12.dp)) {
        Text(relative.displayName, style = MaterialTheme.typography.titleMedium)
        Text(roleTitle(role), color = MaterialTheme.colorScheme.primary)
        (replacement?.marriageDate?.let(::formatGenealogyDate)?.take(4) ?: relationship.marriageYear)
            ?.let { Text(stringResource(R.string.married_year, it), color = MaterialTheme.colorScheme.primary) }
        Row {
            TextButton(onClick = onEdit, modifier = Modifier.testTag("relationship.edit.${relationship.id}")) {
                Text(stringResource(R.string.edit_relationship))
            }
            TextButton(onClick = onRemove, modifier = Modifier.testTag("relationship.delete.${relationship.id}")) {
                Text(stringResource(R.string.remove))
            }
        }
    }
}

@Composable
private fun EditRelationshipDialog(
    person: Person, relative: Person, initial: DraftLink, uiState: AppUiState, key: String,
    onClose: () -> Unit, onSave: (DraftLink) -> Unit,
) {
    val context = LocalContext.current
    var role by uiState.state(key + "role") { initial.role }
    var marriage by uiState.state(key + "marriage") { formatGenealogyDate(initial.marriageDate) }
    var menu by uiState.state(key + "menu") { false }
    var error by uiState.state<String?>(key + "error") { null }
    AlertDialog(
        onDismissRequest = onClose, title = { Text(stringResource(R.string.edit_relationship)) },
        text = { Column {
            Text(stringResource(R.string.relationship_question, relative.displayName, person.displayName))
            TextButton(onClick = { menu = true }, modifier = Modifier.testTag("relationship.edit.role")) { Text(roleTitle(role)) }
            DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                RelativeRole.entries.forEach { item -> DropdownMenuItem(
                    text = { Text(roleTitle(item)) }, onClick = { role = item; menu = false },
                    modifier = Modifier.semantics { selected = role == item }.testTag("relationship.edit.role.${item.wireName}"),
                ) }
            }
            if (role.kind == RelationshipKind.PARTNER) {
                DateField(stringResource(R.string.marriage_date), marriage, { marriage = it; error = null },
                    "relationship.edit.marriageDate")
            }
            error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.testTag("relationship.edit.error")) }
        } },
        dismissButton = { TextButton(onClick = onClose, modifier = Modifier.testTag("relationship.edit.cancel")) { Text(stringResource(R.string.cancel)) } },
        confirmButton = { TextButton(onClick = {
            runCatching { parseGenealogyDate(marriage).takeIf { role.kind == RelationshipKind.PARTNER } }
                .onSuccess { onSave(DraftLink(relative, role, it)) }
                .onFailure { error = context.localizedError(it) }
        }, modifier = Modifier.testTag("relationship.edit.save")) { Text(stringResource(R.string.save)) } },
    )
}

@Composable
private fun PendingLinkChooser(
    people: List<Person>, uiState: AppUiState, key: String, onClose: () -> Unit, onAdd: (DraftLink) -> Unit,
) {
    var role by uiState.state<RelativeRole?>(key + "role") { null }
    AlertDialog(onDismissRequest = onClose, title = { Text(stringResource(R.string.link_existing)) },
        text = { LazyColumn {
            if (role == null) {
                items(RelativeRole.entries, key = { it.wireName }) { item ->
                    TextButton(onClick = { role = item }, modifier = Modifier.fillMaxWidth()
                        .testTag("relationship.link.role.${item.wireName}")) { Text(roleTitle(item)) }
                }
            } else {
                items(people, key = { it.id }) { person ->
                    TextButton(onClick = { onAdd(DraftLink(person, role!!)) }, modifier = Modifier.fillMaxWidth()
                        .testTag("relationship.link.person.${person.id}")) { Text(person.displayName) }
                }
            }
        } },
        dismissButton = { TextButton(onClick = onClose) { Text(stringResource(R.string.cancel)) } },
        confirmButton = {})
}
