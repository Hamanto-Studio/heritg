package tech.robihamanto.heritg.android

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.spring
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import tech.robihamanto.heritg.android.core.domain.RelativeRole
import tech.robihamanto.heritg.android.core.domain.relativeRoleFor
import tech.robihamanto.heritg.android.core.model.FamilyRelationship
import tech.robihamanto.heritg.android.core.model.Person
import tech.robihamanto.heritg.android.core.model.PersonGender
import tech.robihamanto.heritg.android.core.model.RelationshipKind
import java.time.Instant

internal data class DraftLink(
    val person: Person,
    val role: RelativeRole,
    val marriageDate: Instant? = null,
    val inferGender: Boolean = true,
)

@Composable
internal fun RoleGrid(
    roles: List<RelativeRole>,
    tagPrefix: String,
    selectedRole: RelativeRole? = null,
    onSelect: (RelativeRole) -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        roles.chunked(2).forEach { rowRoles ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                rowRoles.forEach { role ->
                    RoleButton(
                        role = role,
                        selected = role == selectedRole,
                        tag = "$tagPrefix.${role.wireName}",
                        onClick = { onSelect(role) },
                        modifier = Modifier.weight(1f),
                    )
                }
                if (rowRoles.size == 1) Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun RoleButton(
    role: RelativeRole,
    selected: Boolean,
    tag: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val content: @Composable () -> Unit = {
        Icon(painterResource(role.iconResource()), contentDescription = null, modifier = Modifier.size(20.dp))
        Text(roleTitle(role), Modifier.padding(start = 8.dp), maxLines = 2)
    }
    val buttonModifier = modifier.sizeIn(minHeight = 52.dp).semantics { this.selected = selected }.testTag(tag)
    if (selected) Button(onClick = onClick, modifier = buttonModifier) { content() }
    else OutlinedButton(onClick = onClick, modifier = buttonModifier) { content() }
}

internal fun RelativeRole.iconResource(): Int = when {
    kind == RelationshipKind.PARTNER -> R.drawable.ic_role_partner
    kind == RelationshipKind.SIBLING -> R.drawable.ic_role_sibling
    relativeIsParent -> R.drawable.ic_role_parent
    else -> R.drawable.ic_role_child
}

@Composable
internal fun RelationshipRow(
    person: Person,
    relative: Person,
    relationship: FamilyRelationship,
    replacement: DraftLink?,
    onEdit: () -> Unit,
    onRemove: () -> Unit,
) {
    val role = replacement?.role ?: relativeRoleFor(relationship, relative, person.id)
    val editDescription = stringResource(R.string.edit_relationship_with, relative.displayName)
    val removeDescription = stringResource(R.string.remove_relationship_with, relative.displayName)
    Column(
        Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface, RoundedCornerShape(12.dp)).padding(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                painterResource(role.iconResource()),
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
            )
            Column(Modifier.padding(start = 10.dp)) {
                Text(relative.displayName, style = MaterialTheme.typography.titleMedium)
                Text(roleTitle(role), color = MaterialTheme.colorScheme.primary)
                (if (replacement != null) replacement.marriageDate?.let(::formatGenealogyDate)?.take(4)
                else relationship.marriageYear)
                    ?.let { Text(stringResource(R.string.married_year, it), color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
        }
        Row {
            TextButton(onClick = onEdit, modifier = Modifier.semantics {
                contentDescription = editDescription
            }.testTag("relationship.edit.${relationship.id}")) {
                Text(stringResource(R.string.edit_relationship))
            }
            TextButton(onClick = onRemove, modifier = Modifier.semantics {
                contentDescription = removeDescription
            }.testTag("relationship.delete.${relationship.id}")) {
                Text(stringResource(R.string.remove))
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun EditRelationshipSheet(
    person: Person,
    relative: Person,
    initial: DraftLink,
    onClose: () -> Unit,
    onSave: (DraftLink) -> Unit,
) {
    val stateInputs = arrayOf<Any?>(
        initial.person.id, initial.role.name, initial.marriageDate?.toEpochMilli(), initial.inferGender,
    )
    var roleName by rememberSaveable(*stateInputs) { mutableStateOf(initial.role.name) }
    var marriage by rememberSaveable(*stateInputs) { mutableStateOf(formatGenealogyDate(initial.marriageDate)) }
    var inferGender by rememberSaveable(*stateInputs) { mutableStateOf(initial.inferGender) }
    val role = RelativeRole.valueOf(roleName)
    ModalBottomSheet(
        onDismissRequest = onClose,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MaterialTheme.colorScheme.background,
    ) {
        Column(
            Modifier.fillMaxWidth().fillMaxHeight(.9f).verticalScroll(rememberScrollState()).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Header(stringResource(R.string.edit_relationship), "relationship.edit.cancel", onClose)
            Text(
                stringResource(R.string.relationship_question, relative.displayName, person.displayName),
                Modifier.semantics { heading() },
                style = MaterialTheme.typography.titleMedium,
            )
            RoleGrid(
                roles = rolesCompatibleWith(relative, initial.role),
                tagPrefix = "relationship.edit.role",
                selectedRole = role,
                onSelect = {
                    roleName = it.name
                    inferGender = true
                },
            )
            AnimatedVisibility(
                visible = role.kind == RelationshipKind.PARTNER,
                enter = fadeIn(spring()) + expandVertically(spring()),
                exit = fadeOut(spring()) + shrinkVertically(spring()),
            ) {
                DateField(
                    label = stringResource(R.string.marriage_date),
                    value = marriage,
                    onValue = { marriage = it },
                    tag = "relationship.edit.marriageDate",
                    addLabel = R.string.add_marriage_date,
                    deleteLabel = R.string.delete_marriage_date,
                )
            }
            Button(
                onClick = {
                    val date = if (role.kind == RelationshipKind.PARTNER) parseGenealogyDate(marriage) else null
                    onSave(DraftLink(relative, role, date, inferGender))
                },
                modifier = Modifier.fillMaxWidth().testTag("relationship.edit.save"),
            ) { Text(stringResource(R.string.save)) }
        }
    }
}

@Composable
internal fun PendingLinkChooser(
    people: List<Person>,
    uiState: AppUiState,
    key: String,
    onClose: () -> Unit,
    onAdd: (DraftLink) -> Unit,
) {
    var role by uiState.state<RelativeRole?>(key + "role") { null }
    fun dismiss() {
        role = null
        onClose()
    }
    BackHandler(enabled = role != null) { role = null }
    AlertDialog(
        onDismissRequest = ::dismiss,
        title = { Text(stringResource(R.string.link_existing), Modifier.semantics { heading() }) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (role == null) {
                    RelativeRole.entries.forEach { item ->
                        RoleButton(
                            role = item,
                            selected = false,
                            tag = "relationship.link.role.${item.wireName}",
                            onClick = { role = item },
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                } else {
                    people.filter { role!!.isCompatibleWith(it) }.forEach { person ->
                        TextButton(
                            onClick = {
                                val selectedRole = role!!
                                role = null
                                onAdd(DraftLink(person, selectedRole))
                            },
                            modifier = Modifier.fillMaxWidth().testTag("relationship.link.person.${person.id}"),
                        ) { Text(person.displayName) }
                    }
                }
            }
        },
        dismissButton = { TextButton(onClick = { if (role == null) dismiss() else role = null }) {
            Text(stringResource(if (role == null) R.string.cancel else R.string.back))
        } },
        confirmButton = {},
    )
}

internal fun RelativeRole.isCompatibleWith(person: Person): Boolean =
    person.gender == PersonGender.UNSPECIFIED || gender == PersonGender.UNSPECIFIED || gender == person.gender

private fun rolesCompatibleWith(person: Person, current: RelativeRole): List<RelativeRole> =
    (RelativeRole.entries.filter { it.isCompatibleWith(person) } + current).distinct()
