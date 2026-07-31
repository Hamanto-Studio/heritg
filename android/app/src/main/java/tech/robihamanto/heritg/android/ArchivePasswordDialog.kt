package tech.robihamanto.heritg.android

import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import tech.robihamanto.heritg.android.core.model.FamilyTree

@Composable
internal fun ArchivePasswordDialog(
    data: ByteArray,
    sourceName: String,
    uiState: AppUiState,
    onClose: () -> Unit,
    restore: suspend (ByteArray, String) -> FamilyTree,
    onRestored: (FamilyTree) -> Unit,
) {
    val context = LocalContext.current
    val passwordFocus = remember { FocusRequester() }
    val errorFocus = remember { FocusRequester() }
    var password by uiState.state("password:value") { "" }
    var error by uiState.state<String?>("password:error") { null }
    var working by uiState.state("password:working") { false }
    LaunchedEffect(Unit) { passwordFocus.requestFocus() }
    LaunchedEffect(error) { if (error != null) errorFocus.requestFocus() }
    AlertDialog(
        onDismissRequest = { if (!working) onClose() },
        title = { Text(stringResource(R.string.encrypted_backup)) },
        text = {
            Column {
                Text(sourceName)
                Text(stringResource(R.string.enter_backup_password), modifier = Modifier.padding(vertical = 8.dp))
                OutlinedTextField(
                    password,
                    { password = it; error = null },
                    Modifier.testTag("import.archivePassword").focusRequester(passwordFocus),
                    label = { Text(stringResource(R.string.password)) },
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true,
                    enabled = !working,
                )
                error?.let {
                    Text(
                        it,
                        color = MaterialTheme.colorScheme.error,
                        modifier = Modifier.padding(top = 8.dp).focusRequester(errorFocus).focusable()
                            .semantics { liveRegion = LiveRegionMode.Assertive }.testTag("import.archiveError"),
                    )
                }
                if (working) Row(verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(Modifier.padding(8.dp))
                    Text(stringResource(R.string.decrypting_backup))
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onClose, enabled = !working) { Text(stringResource(R.string.cancel)) }
        },
        confirmButton = {
            TextButton(
                onClick = { uiState.launch {
                    working = true
                    error = null
                    runCatching { restore(data, password) }
                        .onSuccess { tree -> password = ""; onRestored(tree) }
                        .onFailure { error = context.localizedError(it) }
                    working = false
                } },
                enabled = password.isNotEmpty() && !working,
                modifier = Modifier.testTag("import.restore"),
            ) { Text(stringResource(R.string.restore_family_tree)) }
        },
    )
}
