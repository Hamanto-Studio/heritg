package tech.robihamanto.heritg.android

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import tech.robihamanto.heritg.android.core.domain.RelativeRole
import tech.robihamanto.heritg.android.core.model.GenealogyDates
import tech.robihamanto.heritg.android.core.model.PersonGender
import java.time.Instant
import java.time.LocalDate

@Composable
internal fun GenderMenu(value: PersonGender, onValue: (PersonGender) -> Unit) {
    ChoiceMenu(
        stringResource(R.string.gender),
        stringResource(when (value) {
            PersonGender.MALE -> R.string.male
            PersonGender.FEMALE -> R.string.female
            PersonGender.UNSPECIFIED -> R.string.not_specified
        }),
        PersonGender.entries.map { gender -> gender.wireName to stringResource(when (gender) {
            PersonGender.MALE -> R.string.male
            PersonGender.FEMALE -> R.string.female
            PersonGender.UNSPECIFIED -> R.string.not_specified
        }) },
        { wire -> onValue(PersonGender.fromWire(wire) ?: PersonGender.UNSPECIFIED) },
        "person.gender",
    )
}

@Composable
internal fun ChoiceMenu(
    label: String,
    value: String,
    choices: List<Pair<String, String>>,
    onChoice: (String) -> Unit,
    tag: String,
) {
    var open by remember { mutableStateOf(false) }
    Column {
        TextButton(onClick = { open = true }, modifier = Modifier.fillMaxWidth().testTag(tag)) {
            Text("$label: $value")
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            choices.forEach { choice ->
                DropdownMenuItem(text = { Text(choice.second) }, onClick = {
                    open = false
                    onChoice(choice.first)
                })
            }
        }
    }
}

@Composable
internal fun DateField(label: String, value: String, onValue: (String) -> Unit, tag: String) {
    OutlinedTextField(
        value, onValue, Modifier.fillMaxWidth().testTag(tag),
        label = { Text(stringResource(R.string.date_field_label, label)) }, singleLine = true,
    )
}

@Composable
internal fun FormColumn(content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(12.dp),
        content = content)
}

@Composable
internal fun Header(title: String, closeTag: String, onClose: () -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(title, Modifier.weight(1f), style = MaterialTheme.typography.headlineSmall)
        TextButton(onClick = onClose, modifier = Modifier.testTag(closeTag)) { Text(stringResource(R.string.close)) }
    }
}

@Composable
internal fun ConfirmDialog(title: Int, message: Int, cancel: () -> Unit, confirm: () -> Unit, tag: String) {
    AlertDialog(
        onDismissRequest = cancel,
        title = { Text(stringResource(title)) },
        text = { Text(stringResource(message)) },
        dismissButton = { TextButton(onClick = cancel) { Text(stringResource(
            if (title == R.string.discard_changes) R.string.continue_editing else R.string.cancel,
        )) } },
        confirmButton = { TextButton(onClick = confirm, modifier = Modifier.testTag(tag)) {
            Text(stringResource(if (title == R.string.discard_changes) R.string.discard_changes_action else R.string.remove))
        } },
    )
}

internal fun roleGroups() = listOf(
    R.string.common to listOf(RelativeRole.FATHER, RelativeRole.MOTHER, RelativeRole.SON, RelativeRole.DAUGHTER,
        RelativeRole.BROTHER, RelativeRole.SISTER, RelativeRole.PARTNER),
    R.string.parents_guardians to listOf(RelativeRole.STEPFATHER, RelativeRole.STEPMOTHER, RelativeRole.ADOPTIVE_FATHER,
        RelativeRole.ADOPTIVE_MOTHER, RelativeRole.FOSTER_FATHER, RelativeRole.FOSTER_MOTHER, RelativeRole.GUARDIAN),
    R.string.partners_spouses to listOf(RelativeRole.HUSBAND, RelativeRole.WIFE, RelativeRole.FORMER_PARTNER,
        RelativeRole.FORMER_HUSBAND, RelativeRole.FORMER_WIFE),
    R.string.children to listOf(RelativeRole.STEPSON, RelativeRole.STEPDAUGHTER, RelativeRole.ADOPTIVE_SON,
        RelativeRole.ADOPTIVE_DAUGHTER, RelativeRole.FOSTER_SON, RelativeRole.FOSTER_DAUGHTER, RelativeRole.WARD),
    R.string.siblings to listOf(RelativeRole.HALF_BROTHER, RelativeRole.HALF_SISTER, RelativeRole.STEPBROTHER,
        RelativeRole.STEPSISTER, RelativeRole.ADOPTIVE_BROTHER, RelativeRole.ADOPTIVE_SISTER,
        RelativeRole.FOSTER_BROTHER, RelativeRole.FOSTER_SISTER),
)

internal fun parseGenealogyDate(value: String): Instant? = value.trim().takeIf { it.isNotEmpty() }?.let {
    GenealogyDates.fromCalendarDate(LocalDate.parse(it))
}

internal fun formatGenealogyDate(value: Instant?): String = value?.let(GenealogyDates::toCalendarDate)?.toString().orEmpty()

internal fun ByteArray?.contentEqualsNullable(other: ByteArray?) = when {
    this == null -> other == null
    other == null -> false
    else -> contentEquals(other)
}
