package tech.robihamanto.heritg.android

import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.appcompat.app.AppCompatDelegate
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.core.content.pm.PackageInfoCompat
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import tech.robihamanto.heritg.android.core.domain.semanticFormatter
import tech.robihamanto.heritg.android.core.interop.ArchivePayload
import tech.robihamanto.heritg.android.core.interop.GedcomExporter
import tech.robihamanto.heritg.android.core.interop.HeritgArchiveCodec
import tech.robihamanto.heritg.android.core.interop.TreeSvgExporter
import tech.robihamanto.heritg.android.core.model.FamilyRelationship
import tech.robihamanto.heritg.android.core.model.FamilyTree
import tech.robihamanto.heritg.android.core.model.Person
import tech.robihamanto.heritg.android.core.tree.TreeGenerationLimits
import tech.robihamanto.heritg.android.core.tree.TreeLayout
import tech.robihamanto.heritg.android.core.tree.TreeLayoutResult
import java.time.Instant
import java.time.LocalDate

private enum class SettingsPage { ROOT, LANGUAGE, EXPORT }
private data class GeneratedShare(val bytes: ByteArray, val name: String, val mime: String) : MemoryOnlyValue {
    override fun clearMemory() = bytes.fill(0)
}

@Composable
internal fun SettingsFlow(
    tree: FamilyTree, people: List<Person>, relationships: List<FamilyRelationship>,
    codec: HeritgArchiveCodec, uiState: AppUiState, onClose: () -> Unit, onLanguage: (String) -> Unit,
) {
    val prefix = "settings:${tree.id}:"
    var page by uiState.state(prefix + "page") { SettingsPage.ROOT }
    when (page) {
        SettingsPage.ROOT -> SettingsRoot(onClose, { page = SettingsPage.EXPORT }, { page = SettingsPage.LANGUAGE })
        SettingsPage.LANGUAGE -> LanguageScreen({ page = SettingsPage.ROOT }, onLanguage)
        SettingsPage.EXPORT -> ExportScreen(tree, people, relationships, codec, uiState, prefix + "export:") {
            uiState.clear(prefix + "export:")
            page = SettingsPage.ROOT
        }
    }
}

@Composable
private fun SettingsRoot(onClose: () -> Unit, onExport: () -> Unit, onLanguage: () -> Unit) {
    val context = LocalContext.current
    val packageInfo = remember(context) {
        context.packageManager.getPackageInfo(context.packageName, 0)
    }
    val feedbackMessage = stringResource(
        R.string.feedback_message,
        packageInfo.versionName ?: "Unknown",
        PackageInfoCompat.getLongVersionCode(packageInfo),
        Build.MODEL,
        Build.VERSION.RELEASE,
    )
    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(20.dp)) {
        Row(Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.settings), Modifier.weight(1f), style = MaterialTheme.typography.headlineSmall)
            TextButton(onClick = onClose, modifier = Modifier.testTag("settings.close")) { Text(stringResource(R.string.done)) }
        }
        Text(stringResource(R.string.private_trees), style = MaterialTheme.typography.titleLarge)
        Text(stringResource(R.string.privacy_copy), color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(20.dp))
        SettingsRow(stringResource(R.string.export), stringResource(R.string.export_subtitle), "settings.export", onExport)
        SettingsRow(stringResource(R.string.language), selectedLanguageName(), "settings.language", onLanguage)
        SettingsRow(stringResource(R.string.feedback), stringResource(R.string.feedback_subtitle), "settings.feedback") {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(
                "https://t.me/robihamanto?text=${Uri.encode(feedbackMessage)}",
            )))
        }
        Spacer(Modifier.height(20.dp))
        Text(stringResource(R.string.studio_credit), color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.fillMaxWidth().testTag("settings.studioCredit"))
    }
}

@Composable
private fun SettingsRow(title: String, subtitle: String, tag: String, onClick: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().padding(vertical = 5.dp).background(MaterialTheme.colorScheme.surface, RoundedCornerShape(14.dp))
            .clickable { onClick() }.sizeIn(minHeight = 64.dp).padding(16.dp).testTag(tag),
    ) { Text(title, style = MaterialTheme.typography.titleMedium); Text(subtitle, color = MaterialTheme.colorScheme.primary) }
}

@Composable
private fun LanguageScreen(onBack: () -> Unit, onLanguage: (String) -> Unit) {
    val selected = AppCompatDelegate.getApplicationLocales().toLanguageTags().substringBefore(',').ifEmpty {
        LocalConfiguration.current.locales[0].language
    }
    Column(Modifier.padding(20.dp)) {
        Row { TextButton(onClick = onBack) { Text(stringResource(R.string.back)) }; Text(stringResource(R.string.language), style = MaterialTheme.typography.headlineSmall) }
        Text(stringResource(R.string.language_copy), color = MaterialTheme.colorScheme.primary)
        listOf("en" to "English", "id" to "Bahasa Indonesia").forEach { (tag, title) ->
            Row(
                Modifier.fillMaxWidth().clickable { onLanguage(tag) }.sizeIn(minHeight = 52.dp).padding(12.dp)
                    .semantics { this.selected = selected.startsWith(tag) }.testTag("settings.language.$tag"),
            ) { Text(title, Modifier.weight(1f)); if (selected.startsWith(tag)) Text("✓", color = MaterialTheme.colorScheme.primary) }
        }
    }
}

@Composable
private fun ExportScreen(
    tree: FamilyTree, people: List<Person>, relationships: List<FamilyRelationship>,
    codec: HeritgArchiveCodec, uiState: AppUiState, prefix: String, onBack: () -> Unit,
) {
    val context = LocalContext.current
    val locale = LocalConfiguration.current.locales[0]
    val errorFocus = remember { FocusRequester() }
    var pointOfView by uiState.state<String?>(prefix + "pointOfView") { tree.lastSelectedPersonId }
    var pointMenu by uiState.state(prefix + "pointMenu") { false }
    var encrypt by uiState.state(prefix + "encrypt") { false }
    var password by uiState.state(prefix + "password") { "" }
    var confirmation by uiState.state(prefix + "confirmation") { "" }
    var working by uiState.state(prefix + "working") { false }
    var error by uiState.state<String?>(prefix + "error") { null }
    var generatedArchive by uiState.state<GeneratedShare?>(prefix + "generatedArchive") { null }
    val passwordMismatch = stringResource(R.string.passwords_mismatch)
    val layout by produceState<TreeLayoutResult?>(null, people, relationships, pointOfView, locale) {
        value = withContext(Dispatchers.Default) {
            TreeLayout.make(
                null, people.snapshots(locale), relationships.snapshots(), pointOfView,
                TreeGenerationLimits(), semanticFormatter(locale),
            )
        }
    }
    val base = remember(tree.title) {
        tree.title.replace(Regex("[^A-Za-z0-9]+"), "-").trim('-').ifEmpty { "Heritg-Family-Tree" } + "-${LocalDate.now()}"
    }
    fun prepare(name: String, mime: String, block: () -> ByteArray) {
        working = true; error = null
        uiState.launch {
            var bytes: ByteArray? = null
            try {
                val generated = withContext(Dispatchers.Default) { block() }
                bytes = generated
                LocalFiles.share(context, generated, name, mime)
            } catch (failure: Throwable) {
                error = context.localizedError(failure)
            } finally {
                bytes?.fill(0)
            }
            working = false
        }
    }
    fun prepareArchive() {
        if (encrypt && password != confirmation) {
            error = passwordMismatch
            return
        }
        val enteredPassword = password.takeIf { encrypt }
        val name = "$base.heritg"
        generatedArchive?.clearMemory(); generatedArchive = null
        error = null
        working = true
        uiState.launch {
            runCatching { withContext(Dispatchers.Default) {
                codec.encode(ArchivePayload(Instant.now(), tree, people, relationships), enteredPassword)
            } }.onSuccess { bytes ->
                password = ""
                confirmation = ""
                generatedArchive = GeneratedShare(
                    bytes, name,
                    if (enteredPassword == null) LocalFiles.UnencryptedArchiveMime else LocalFiles.EncryptedArchiveMime,
                )
            }.onFailure { error = context.localizedError(it) }
            working = false
        }
    }
    LaunchedEffect(error) { if (error != null) errorFocus.requestFocus() }
    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(20.dp)) {
        Row { TextButton(onClick = onBack) { Text(stringResource(R.string.back)) }; Text(stringResource(R.string.export), style = MaterialTheme.typography.headlineSmall) }
        Text(stringResource(R.string.export_heading), style = MaterialTheme.typography.titleLarge)
        Text(stringResource(R.string.export_copy), color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(16.dp))
        Column(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface, RoundedCornerShape(14.dp)).padding(14.dp)) {
            Text(stringResource(R.string.point_of_view), style = MaterialTheme.typography.titleMedium)
            TextButton(onClick = { pointMenu = true }, modifier = Modifier.testTag("settings.exportPointOfView")) {
                Text(people.firstOrNull { it.id == pointOfView }?.displayName ?: stringResource(R.string.names_only))
            }
            DropdownMenu(expanded = pointMenu, onDismissRequest = { pointMenu = false }) {
                DropdownMenuItem(text = { Text(stringResource(R.string.names_only)) }, onClick = { pointOfView = null; pointMenu = false })
                people.sortedBy { it.displayName }.forEach { person -> DropdownMenuItem(text = { Text(person.displayName) }, onClick = {
                    pointOfView = person.id; pointMenu = false
                }) }
            }
        }
        Button(onClick = { layout?.let { current -> prepare("$base-Chart.png", "image/png") {
            TreePngExporter.export(current, pointOfView != null, locale = locale)
        } } }, enabled = !working && layout != null, modifier = Modifier.fillMaxWidth().testTag("settings.exportPNG")) { Text(stringResource(R.string.export_png)) }
        OutlinedButton(onClick = { layout?.let { current -> prepare("$base-Chart.svg", "image/svg+xml") {
            TreeSvgExporter.export(current, pointOfView != null, locale = locale).encodeToByteArray()
        } } }, enabled = !working && layout != null, modifier = Modifier.fillMaxWidth().testTag("settings.exportSVG")) { Text(stringResource(R.string.export_svg)) }
        OutlinedButton(onClick = { prepare("$base.ged", "text/plain") {
            GedcomExporter.export(people, relationships).encodeToByteArray()
        } }, enabled = !working, modifier = Modifier.fillMaxWidth().testTag("settings.exportGEDCOM")) { Text(stringResource(R.string.export_gedcom)) }
        Spacer(Modifier.height(20.dp))
        Text(stringResource(R.string.heritg_backup), style = MaterialTheme.typography.titleMedium)
        Text(stringResource(R.string.backup_copy), color = MaterialTheme.colorScheme.primary)
        Row(Modifier.fillMaxWidth().clickable(enabled = !working) {
            encrypt = !encrypt
            generatedArchive?.clearMemory(); generatedArchive = null
            if (!encrypt) { password = ""; confirmation = "" }
        }.testTag("settings.encryptArchive")) {
            Checkbox(encrypt, {
                encrypt = it
                generatedArchive?.clearMemory(); generatedArchive = null
                if (!it) { password = ""; confirmation = "" }
            }, enabled = !working)
            Text(stringResource(R.string.encrypt_optional), Modifier.padding(top = 12.dp))
        }
        if (encrypt) {
            Text(stringResource(R.string.password_restore_notice), color = MaterialTheme.colorScheme.primary)
            OutlinedTextField(password, { password = it; generatedArchive?.clearMemory(); generatedArchive = null; error = null },
                Modifier.fillMaxWidth().testTag("settings.archivePassword"),
                label = { Text(stringResource(R.string.password)) }, visualTransformation = PasswordVisualTransformation(),
                singleLine = true, enabled = !working)
            OutlinedTextField(confirmation, { confirmation = it; generatedArchive?.clearMemory(); generatedArchive = null; error = null },
                Modifier.fillMaxWidth().testTag("settings.archivePasswordConfirmation"),
                label = { Text(stringResource(R.string.confirm_password)) }, visualTransformation = PasswordVisualTransformation(),
                singleLine = true, enabled = !working)
            if (confirmation.isNotEmpty() && password != confirmation) Text(
                stringResource(R.string.passwords_mismatch), color = MaterialTheme.colorScheme.error,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive }.testTag("settings.passwordMismatch"),
            )
        } else Text(stringResource(R.string.unencrypted_warning), color = MaterialTheme.colorScheme.error)
        Button(onClick = ::prepareArchive,
            enabled = !working && (!encrypt || password.isNotEmpty() && confirmation.isNotEmpty()),
            modifier = Modifier.fillMaxWidth().testTag("settings.exportHeritg")) {
            Text(if (working) stringResource(R.string.creating_backup) else stringResource(R.string.create_backup))
        }
        if (working) CircularProgressIndicator(Modifier.testTag("settings.exportProgress"))
        generatedArchive?.let { share -> OutlinedButton(onClick = {
            uiState.launch {
                runCatching { LocalFiles.share(context, share.bytes, share.name, share.mime) }
                    .onFailure { error = context.localizedError(it) }
            }
        }, modifier = Modifier.fillMaxWidth().testTag("settings.shareHeritg")) {
            Text(stringResource(R.string.share_backup))
        } }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.focusRequester(errorFocus).focusable()
            .semantics { liveRegion = LiveRegionMode.Assertive }.testTag("settings.exportError")) }
        Spacer(Modifier.height(32.dp))
    }
}

@Composable
private fun selectedLanguageName(): String {
    val tag = AppCompatDelegate.getApplicationLocales().toLanguageTags()
    val language = tag.ifEmpty { LocalConfiguration.current.locales[0].language }
    return if (language.startsWith("id")) "Bahasa Indonesia" else "English"
}
