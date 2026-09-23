package tech.robihamanto.heritg.android

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import tech.robihamanto.heritg.android.core.domain.RelativeRole
import tech.robihamanto.heritg.android.core.model.GenealogyDates
import tech.robihamanto.heritg.android.core.model.BirthDatePrecision
import tech.robihamanto.heritg.android.core.model.PersonGender
import java.time.Instant
import java.time.LocalDate
import java.time.Period
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle

internal enum class FormTextInput(
    val capitalization: KeyboardCapitalization,
    val imeAction: ImeAction,
    val multiline: Boolean = false,
) {
    NAME(KeyboardCapitalization.Words, ImeAction.Next),
    SEARCH(KeyboardCapitalization.None, ImeAction.Search),
    PLACE(KeyboardCapitalization.Words, ImeAction.Next),
    POSTAL(KeyboardCapitalization.Characters, ImeAction.Next),
    NOTES(KeyboardCapitalization.Sentences, ImeAction.Default, multiline = true),
}

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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun DateField(
    label: String,
    value: String,
    onValue: (String) -> Unit,
    tag: String,
    addLabel: Int,
    deleteLabel: Int,
) {
    var showPicker by remember { mutableStateOf(false) }
    val locale = LocalConfiguration.current.primaryLocale
    AnimatedContent(
        targetState = value.isNotBlank(),
        transitionSpec = { fadeIn() togetherWith fadeOut() using SizeTransform(clip = false) },
        label = "optional date",
    ) { hasValue ->
        if (hasValue) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                OutlinedButton(
                    onClick = { showPicker = true },
                    modifier = Modifier.weight(1f).testTag(tag),
                ) {
                    Text(label)
                    Spacer(Modifier.weight(1f))
                    Text(formattedDate(value, locale))
                }
                IconButton(
                    onClick = { onValue("") },
                    modifier = Modifier.testTag("$tag.delete"),
                ) {
                    Icon(painterResource(R.drawable.ic_delete), stringResource(deleteLabel))
                }
            }
        } else {
            OutlinedButton(
                onClick = { showPicker = true },
                modifier = Modifier.fillMaxWidth().testTag("$tag.add"),
            ) {
                Icon(painterResource(R.drawable.ic_calendar_add), contentDescription = null)
                Text(stringResource(addLabel), Modifier.padding(start = 8.dp))
            }
        }
    }
    if (showPicker) {
        val initial = value.takeIf(String::isNotBlank)?.let(::parseDateMillis)
            ?: LocalDate.now().atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
        val picker = androidx.compose.material3.rememberDatePickerState(
            initialSelectedDateMillis = initial,
            yearRange = 1..9999,
        )
        DatePickerDialog(
            onDismissRequest = { showPicker = false },
            confirmButton = { TextButton(onClick = {
                picker.selectedDateMillis?.let { millis ->
                    onValue(Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate().toString())
                }
                showPicker = false
            }) { Text(stringResource(R.string.ok)) } },
            dismissButton = { TextButton(onClick = { showPicker = false }) {
                Text(stringResource(R.string.cancel))
            } },
        ) { DatePicker(picker) }
    }
}

@Composable
internal fun FormTextField(
    value: String,
    onValue: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    input: FormTextInput = FormTextInput.PLACE,
    imeAction: ImeAction = input.imeAction,
    isError: Boolean = false,
    onDone: (() -> Unit)? = null,
) {
    OutlinedTextField(
        value, onValue, modifier.fillMaxWidth(), label = { Text(label) }, singleLine = !input.multiline,
        minLines = if (input.multiline) 3 else 1, isError = isError,
        keyboardOptions = KeyboardOptions(capitalization = input.capitalization,
            keyboardType = KeyboardType.Text, imeAction = imeAction),
        keyboardActions = rememberFormKeyboardActions(onDone),
    )
}

@Composable
internal fun FormColumn(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(modifier.fillMaxWidth().verticalScroll(rememberScrollState()).imePadding().padding(20.dp),
        verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(12.dp),
        content = content)
}

@Composable
internal fun rememberFormKeyboardActions(onDone: (() -> Unit)? = null): KeyboardActions {
    val focusManager = LocalFocusManager.current
    val keyboardController = LocalSoftwareKeyboardController.current
    return KeyboardActions(
        onNext = { focusManager.moveFocus(FocusDirection.Next) },
        onDone = { onDone?.invoke(); focusManager.clearFocus(); keyboardController?.hide() },
        onSearch = { focusManager.clearFocus(); keyboardController?.hide() },
    )
}

@Composable
internal fun Header(title: String, closeTag: String, onClose: () -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(title, Modifier.weight(1f).semantics { heading() }, style = MaterialTheme.typography.headlineSmall)
        IconButton(onClick = onClose, modifier = Modifier.testTag(closeTag)) {
            Icon(painterResource(R.drawable.ic_close), stringResource(R.string.close))
        }
    }
}

@Composable
internal fun ConfirmDialog(title: Int, message: Int, cancel: () -> Unit, confirm: () -> Unit, tag: String) {
    AlertDialog(
        onDismissRequest = cancel,
        title = { Text(stringResource(title), Modifier.semantics { heading() }) },
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

internal fun birthPrecisionForDraft(
    draft: String,
    originalDate: Instant?,
    originalPrecision: BirthDatePrecision,
): BirthDatePrecision = if (draft == formatGenealogyDate(originalDate)) originalPrecision else BirthDatePrecision.EXACT

internal fun draftAge(birth: String, death: String): Int? = runCatching {
    val birthday = birth.takeIf(String::isNotBlank)?.let(LocalDate::parse) ?: return null
    val reference = death.takeIf(String::isNotBlank)?.let(LocalDate::parse) ?: LocalDate.now()
    if (reference < birthday) null else Period.between(birthday, reference).years
}.getOrNull()

private fun parseDateMillis(value: String): Long = LocalDate.parse(value)
    .atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()

private fun formattedDate(value: String, locale: java.util.Locale): String = runCatching {
    LocalDate.parse(value).format(DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale))
}.getOrDefault(value)

internal fun ByteArray?.contentEqualsNullable(other: ByteArray?) = when {
    this == null -> other == null
    other == null -> false
    else -> contentEquals(other)
}
