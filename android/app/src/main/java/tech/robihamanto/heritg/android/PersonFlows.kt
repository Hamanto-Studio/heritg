package tech.robihamanto.heritg.android

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.IconButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import tech.robihamanto.heritg.android.core.data.FamilyRepository
import tech.robihamanto.heritg.android.core.data.StagedRelationshipLink
import tech.robihamanto.heritg.android.core.data.TreeState
import tech.robihamanto.heritg.android.core.domain.FamilyGraph
import tech.robihamanto.heritg.android.core.domain.FamilyRoleLabel
import tech.robihamanto.heritg.android.core.domain.KinshipResolver
import tech.robihamanto.heritg.android.core.domain.LifeSummary
import tech.robihamanto.heritg.android.core.domain.RelativeRole
import tech.robihamanto.heritg.android.core.domain.relativeRoleFor
import tech.robihamanto.heritg.android.core.domain.relationshipEndpoints
import tech.robihamanto.heritg.android.core.domain.semanticFormatter
import tech.robihamanto.heritg.android.core.interop.HeritgArchiveCodec
import tech.robihamanto.heritg.android.core.model.FamilyRelationship
import tech.robihamanto.heritg.android.core.model.FamilyTree
import tech.robihamanto.heritg.android.core.model.Person
import tech.robihamanto.heritg.android.core.model.PersonDetails
import tech.robihamanto.heritg.android.core.model.PersonGender
import tech.robihamanto.heritg.android.core.model.RelationshipKind
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
        state.tree?.let { settingsTree -> Surface(Modifier.fillMaxWidth().fillMaxHeight(), color = MaterialTheme.colorScheme.background) {
            SettingsFlow(
                settingsTree, state.people, state.relationships, overlay.generationLimits,
                codec, uiState, onClose, onLanguage,
            )
        } }
        return
    }
    if (tree == null) return
    val scope = rememberCoroutineScope()
    when (overlay) {
        Overlay.People -> Sheet(onClose, .55f) { PeopleList(people, relationships, tree.lastSelectedPersonId, uiState, onClose) { id ->
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
private fun Sheet(onClose: () -> Unit, heightFraction: Float = .94f, content: @Composable () -> Unit) {
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = onClose,
        sheetState = state,
        containerColor = MaterialTheme.colorScheme.background,
    ) { Box(Modifier.fillMaxWidth().fillMaxHeight(heightFraction)) { content() } }
}
@Composable
private fun FirstPersonDialog(uiState: AppUiState, onClose: () -> Unit, onSave: (String, (Throwable) -> Unit) -> Unit) {
    val context = LocalContext.current
    var name by uiState.state("firstPerson:name") { "" }
    var error by uiState.state<String?>("firstPerson:error") { null }
    AlertDialog(
        onDismissRequest = onClose, title = { Text(stringResource(R.string.start_family_tree), Modifier.semantics { heading() }) },
        text = { Column {
            FormTextField(name, { name = it; error = null }, stringResource(R.string.name),
                Modifier.testTag("firstPerson.nameField"), FormTextInput.NAME, ImeAction.Done, error != null,
                onDone = { onSave(name) { error = context.localizedError(it) } })
            error?.let { message -> Text(message, color = MaterialTheme.colorScheme.error,
                modifier = Modifier.semantics { this.error(message) }.testTag("firstPerson.error")) }
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
    people: List<Person>, relationships: List<FamilyRelationship>, selectedId: String?,
    uiState: AppUiState, onClose: () -> Unit, onSelect: (String) -> Unit,
) {
    var query by uiState.state("people:query") { "" }
    val locale = LocalConfiguration.current.locales[0]
    val formatter = remember(locale) { semanticFormatter(locale) }
    val kinship = remember(people, relationships, locale) {
        KinshipResolver.indexed(people.snapshots(locale), relationships.snapshots(), formatter)
    }
    val filteredPeople = people.filter { person ->
        val role = selectedId?.let { kinship.label(person.id, it) }.orEmpty()
        query.isBlank() || person.displayName.contains(query.trim(), true) || role.contains(query.trim(), true)
    }
    Column(Modifier.fillMaxWidth().padding(20.dp)) {
        Header(stringResource(R.string.all_people), "people.close", onClose)
        FormTextField(query, { query = it }, stringResource(R.string.search_people),
            Modifier.fillMaxWidth().testTag("people.search"), FormTextInput.SEARCH)
        Spacer(Modifier.height(12.dp))
        LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(filteredPeople, key = { it.id }) { person ->
                val relationship = selectedId?.takeIf { it != person.id }?.let { focusId ->
                    relationships.firstOrNull {
                        it.fromPersonId == person.id && it.toPersonId == focusId ||
                            it.toPersonId == person.id && it.fromPersonId == focusId
                    }
                }
                val relationshipDetail = selectedId?.let { focusId ->
                    relationship?.let { direct -> FamilyRoleLabel.label(
                        person.gender, direct.kind, focusId, direct.fromPersonId, direct.toPersonId,
                        direct.subtype, formatter,
                    ) } ?: kinship.label(person.id, focusId)
                }?.let { role ->
                    relationship?.marriageYear?.let { year ->
                        "$role · ${stringResource(R.string.married_year, year)}"
                    } ?: role
                }
                val lifeSummary = LifeSummary.summary(person, formatter)
                Row(
                    Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface, RoundedCornerShape(12.dp))
                        .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(12.dp))
                        .semantics { selected = person.id == selectedId }.clickable { onSelect(person.id) }
                        .testTag("people.row.${person.id}").padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Avatar(person, 44.dp)
                    Column(Modifier.padding(start = 12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                        Text(person.displayName, fontWeight = FontWeight.Bold)
                        relationshipDetail?.let { Text(it, style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant) }
                        lifeSummary?.let { Text(it, style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                    Spacer(Modifier.weight(1f))
                    Icon(
                        painterResource(R.drawable.ic_arrow_forward),
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
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
    BackHandler(enabled = role != null) { role = null; coParentId = null; error = null }
    if (role == null) {
        LazyColumn(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item { Header(stringResource(R.string.add_to, target.displayName), "relative.cancel", onClose) }
            roleGroups().forEach { (title, roles) ->
                item { Text(stringResource(title), Modifier.semantics { heading() }, style = MaterialTheme.typography.titleMedium) }
                item { RoleGrid(roles, "relative.role", onSelect = { role = it; coParentId = null }) }
            }
        }
    } else {
        val selectedRole = role!!
        val partners = FamilyGraph.activePartners(target, people, relationships)
        FormColumn {
            Header(stringResource(R.string.new_relative, roleTitle(selectedRole)), "relative.cancel", onClose)
            FormTextField(name, { name = it }, stringResource(R.string.name),
                Modifier.fillMaxWidth().testTag("relative.name"), FormTextInput.NAME)
            DateField(stringResource(R.string.birthday), birth, { birth = it }, "relative.birthDate",
                R.string.add_birthday, R.string.delete_birthday)
            if (selectedRole.kind == RelationshipKind.PARTNER) {
                DateField(stringResource(R.string.marriage_date), marriage, { marriage = it }, "relative.marriageDate",
                    R.string.add_marriage_date, R.string.delete_marriage_date)
            }
            if (selectedRole.allowsCoParent && partners.isNotEmpty()) {
                ChoiceMenu(
                    stringResource(R.string.co_parent), coParentId?.let { id -> partners.firstOrNull { it.id == id }?.displayName }
                        ?: stringResource(R.string.no_co_parent),
                    listOf("" to stringResource(R.string.no_co_parent)) + partners.map { it.id to it.displayName },
                    { coParentId = it.ifEmpty { null } }, "relative.coParent",
                )
            }
            FormTextField(city, { city = it }, stringResource(R.string.city),
                Modifier.testTag("relative.city"), imeAction = ImeAction.Done)
            error?.let { message -> Text(message, color = MaterialTheme.colorScheme.error,
                modifier = Modifier.semantics { this.error(message) }.testTag("relative.error")) }
            Button(onClick = { scope.launch {
                runCatching { repository.addRelative(
                    target.id, name, selectedRole,
                     PersonDetails(birthDate = parseGenealogyDate(birth), city = city),
                    if (selectedRole.kind == RelationshipKind.PARTNER) parseGenealogyDate(marriage) else null,
                    coParentForRole(selectedRole, coParentId),
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
        error?.let { message -> item { Text(message, color = MaterialTheme.colorScheme.error,
            modifier = Modifier.semantics { this.error(message) }.testTag("relationship.link.error")) } }
        if (role == null) item {
            RoleGrid(RelativeRole.entries, "relationship.link.role", onSelect = { role = it })
        } else items(people.filter { candidate -> candidate.id != target.id && role!!.isCompatibleWith(candidate) &&
            relationshipEndpoints(target.id, candidate.id, role!!).let { endpoint -> relationships.none {
                it.kind == endpoint.kind && it.fromPersonId == endpoint.fromPersonId &&
                    it.toPersonId == endpoint.toPersonId
            } }
        }, key = { it.id }) { person ->
            Row(Modifier.fillMaxWidth().clickable { scope.launch {
                runCatching { repository.link(target.id, person.id, role!!) }.onSuccess { onClose() }
                    .onFailure { error = context.localizedError(it) }
            } }.testTag("relationship.link.person.${person.id}").padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                Avatar(person)
                Column(Modifier.padding(start = 12.dp)) {
                    Text(person.displayName, fontWeight = FontWeight.Bold)
                    LifeSummary.summary(person, semanticFormatter(LocalConfiguration.current.locales[0]))?.let {
                        Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
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
        !photo.contentEqualsNullable(person.profilePhotoData) ||
        removed.isNotEmpty() || pending.isNotEmpty() || replacements.isNotEmpty()
    fun requestClose() { if (dirty) confirmDiscard = true else onClose() }
    fun save() { scope.launch {
                runCatching { repository.savePersonEdits(
                    person.id, name, gender,
                     PersonDetails(
                        parseGenealogyDate(birth), parseGenealogyDate(death),
                        birthPrecisionForDraft(birth, person.birthDate, person.birthDatePrecision),
                        person.notes, person.addressLine, city, person.province, person.country, person.postalCode, photo),
                    removed + replacements.keys,
                    (pending + replacements.values).map {
                        StagedRelationshipLink(it.person.id, it.role, it.marriageDate, it.inferGender)
                    },
                ) }.onSuccess { onClose() }.onFailure { error = context.localizedError(it) }
            } }
    BackHandler(onBack = ::requestClose)
    Scaffold(
        topBar = { TopAppBar(
            title = { Text(person.displayName, maxLines = 1) },
            navigationIcon = { IconButton(onClick = ::requestClose, modifier = Modifier.testTag("person.close")) {
                Icon(painterResource(R.drawable.ic_arrow_back), stringResource(R.string.back))
            } },
            actions = { TextButton(onClick = ::save, enabled = dirty, modifier = Modifier.testTag("person.save")) {
                Text(stringResource(R.string.save))
            } },
        ) },
        containerColor = MaterialTheme.colorScheme.background,
    ) { padding ->
      FormColumn(Modifier.padding(padding)) {
        PhotoEditor(person.displayName, photo, uiState, prefix + "photoEditor:", {
            uiState.keepDraftInMemory(prefix)
            photo = it
        })
        FormTextField(name, { name = it }, stringResource(R.string.name),
            Modifier.fillMaxWidth().testTag("person.nameField"), FormTextInput.NAME)
        GenderMenu(gender) { gender = it }
        DateField(stringResource(R.string.birthday), birth, { birth = it }, "person.birthDate",
            R.string.add_birthday, R.string.delete_birthday)
        DateField(stringResource(R.string.death_date), death, { death = it }, "person.deathDate",
            R.string.add_death_date, R.string.delete_death_date)
        draftAge(birth, death)?.let { Text(stringResource(R.string.age_value, it),
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
        FormTextField(city, { city = it }, stringResource(R.string.city), Modifier.testTag("person.city"))
        Text(stringResource(R.string.family), Modifier.semantics { heading() }, style = MaterialTheme.typography.titleMedium)
        related.filter { it.first.id !in removed }.forEach { (relationship, relative) ->
            val replacement = replacements[relationship.id]
            RelationshipRow(
                person, relative, relationship, replacement,
                onEdit = { editing = relationship to relative },
                onRemove = {
                    uiState.keepDraftInMemory(prefix)
                    removed = removed + relationship.id
                    replacements = replacements - relationship.id
                },
            )
        }
        pending.forEach { draft ->
            val removeDescription = stringResource(R.string.remove_relationship_with, draft.person.displayName)
            Row(Modifier.fillMaxWidth().padding(8.dp)) {
            Text("${draft.person.displayName} · ${roleTitle(draft.role)}", Modifier.weight(1f));
            TextButton(onClick = { pending = pending - draft }, modifier = Modifier.semantics {
                contentDescription = removeDescription
            }) { Text(stringResource(R.string.remove)) }
        } }
        OutlinedButton(onClick = { linking = true }, modifier = Modifier.testTag("relationship.link")) { Text(stringResource(R.string.link_existing)) }
        if (linking) PendingLinkChooser(people.filter { candidate -> candidate.id != person.id &&
            related.none { it.first.id !in removed && it.second.id == candidate.id } &&
            pending.none { it.person.id == candidate.id } },
            uiState, prefix + "pendingLink:",
            onClose = { linking = false }, onAdd = {
                uiState.keepDraftInMemory(prefix)
                pending = pending + it
                linking = false
            })
        error?.let { message -> Text(message, color = MaterialTheme.colorScheme.error,
            modifier = Modifier.semantics { this.error(message) }.testTag("person.error")) }
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
        val original = DraftLink(
            relative, relativeRoleFor(relationship, relative, person.id), relationship.marriageDate, inferGender = false,
        )
        EditRelationshipSheet(
            person = person, relative = relative,
            initial = replacements[relationship.id] ?: original,
            onClose = { editing = null }, onSave = { draft ->
                replacements = if (!shouldStageRelationshipDraft(draft, original)) {
                    replacements - relationship.id
                } else {
                    uiState.keepDraftInMemory(prefix)
                    replacements + (relationship.id to draft)
                }
                editing = null
            },
        )
    }
}

internal fun coParentForRole(role: RelativeRole, coParentId: String?): String? =
    coParentId.takeIf { role.allowsCoParent }

internal fun shouldStageRelationshipDraft(draft: DraftLink, original: DraftLink): Boolean =
    draft.inferGender || draft.role != original.role || draft.marriageDate != original.marriageDate
