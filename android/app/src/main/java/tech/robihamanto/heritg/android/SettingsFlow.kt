package tech.robihamanto.heritg.android

import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatDelegate
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.autofill.contentType
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.error
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.isSensitiveData
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.pm.PackageInfoCompat
import androidx.core.net.toUri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import tech.robihamanto.heritg.android.core.domain.semanticFormatter
import tech.robihamanto.heritg.android.core.interop.ArchivePayload
import tech.robihamanto.heritg.android.core.interop.ArchivePasswordPolicy
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun SettingsFlow(
    tree: FamilyTree, people: List<Person>, relationships: List<FamilyRelationship>,
    generationLimits: TreeGenerationLimits, codec: HeritgArchiveCodec, uiState: AppUiState,
    onClose: () -> Unit, onLanguage: (String) -> Unit,
) {
    val prefix = "settings:${tree.id}:"
    var page by uiState.state(prefix + "page") { SettingsPage.ROOT }
    fun navigateBack() {
        if (page == SettingsPage.EXPORT) uiState.clear(prefix + "export:")
        page = SettingsPage.ROOT
    }
    BackHandler {
        if (page == SettingsPage.ROOT) onClose() else navigateBack()
    }
    Scaffold(
        topBar = { TopAppBar(
            title = { Text(stringResource(when (page) {
                SettingsPage.ROOT -> R.string.settings
                SettingsPage.LANGUAGE -> R.string.language
                SettingsPage.EXPORT -> R.string.export
            })) },
            navigationIcon = { IconButton(
                onClick = { if (page == SettingsPage.ROOT) onClose() else navigateBack() },
                modifier = Modifier.testTag(if (page == SettingsPage.ROOT) "settings.close" else "settings.back"),
            ) { Icon(painterResource(R.drawable.ic_arrow_back), stringResource(R.string.back)) } },
        ) },
        containerColor = MaterialTheme.colorScheme.background,
    ) { padding ->
        Box(Modifier.padding(padding)) {
            when (page) {
                SettingsPage.ROOT -> SettingsRoot({ page = SettingsPage.EXPORT }, { page = SettingsPage.LANGUAGE })
                SettingsPage.LANGUAGE -> LanguageScreen(onLanguage)
                SettingsPage.EXPORT -> ExportScreen(
                    tree, people, relationships, generationLimits, codec, uiState, prefix + "export:",
                )
            }
        }
    }
}

@Composable
private fun SettingsRoot(onExport: () -> Unit, onLanguage: () -> Unit) {
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
        Text(stringResource(R.string.private_trees), Modifier.semantics { heading() },
            style = MaterialTheme.typography.titleLarge)
        Text(stringResource(R.string.privacy_copy), color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(20.dp))
        SettingsRow(stringResource(R.string.export), stringResource(R.string.export_subtitle), "settings.export", onExport)
        SettingsRow(stringResource(R.string.language), selectedLanguageName(), "settings.language", onLanguage)
        SettingsRow(stringResource(R.string.feedback), stringResource(R.string.feedback_subtitle), "settings.feedback") {
            context.startActivity(Intent(Intent.ACTION_VIEW,
                "https://t.me/robihamanto?text=${Uri.encode(feedbackMessage)}".toUri()))
        }
        Spacer(Modifier.height(20.dp))
        Text(
            stringResource(R.string.studio_credit),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            style = MaterialTheme.typography.bodySmall,
            modifier = Modifier.fillMaxWidth().testTag("settings.studioCredit"),
        )
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
private fun LanguageScreen(onLanguage: (String) -> Unit) {
    val selected = AppCompatDelegate.getApplicationLocales().toLanguageTags().substringBefore(',').ifEmpty {
        LocalConfiguration.current.locales[0].language
    }
    Column(Modifier.padding(20.dp)) {
        Text(stringResource(R.string.language_copy), color = MaterialTheme.colorScheme.primary)
        Column(Modifier.selectableGroup()) {
            listOf("en" to "English", "id" to "Bahasa Indonesia").forEach { (tag, title) ->
                val isSelected = selected.startsWith(tag)
                Row(
                    Modifier.fillMaxWidth().selectable(isSelected, onClick = { onLanguage(tag) }, role = Role.RadioButton)
                        .sizeIn(minHeight = 52.dp).padding(12.dp).testTag("settings.language.$tag"),
                ) { Text(title, Modifier.weight(1f)); if (isSelected) Icon(
                    painterResource(R.drawable.ic_check), contentDescription = null, tint = MaterialTheme.colorScheme.primary,
                ) }
            }
        }
    }
}

@Composable
private fun ExportScreen(
    tree: FamilyTree, people: List<Person>, relationships: List<FamilyRelationship>,
    generationLimits: TreeGenerationLimits, codec: HeritgArchiveCodec, uiState: AppUiState,
    prefix: String,
) {
    val context = LocalContext.current
    val locale = LocalConfiguration.current.locales[0]
    val density = LocalDensity.current.density
    val textMeasurer = remember(density) { AndroidTreeTextMeasurer(density) }
    val errorFocus = remember { FocusRequester() }
    var pointOfView by uiState.state<String?>(prefix + "pointOfView") { tree.lastSelectedPersonId }
    var pointMenu by uiState.state(prefix + "pointMenu") { false }
    var password by uiState.state(prefix + "password") { "" }
    var confirmation by uiState.state(prefix + "confirmation") { "" }
    var working by uiState.state(prefix + "working") { false }
    var error by uiState.state<String?>(prefix + "error") { null }
    var generatedArchive by uiState.state<GeneratedShare?>(prefix + "generatedArchive") { null }
    var exportSheet by uiState.state<GeneratedShare?>(prefix + "exportSheet") { null }
    var exportSheetIsTransient by uiState.state(prefix + "exportSheetTransient") { true }
    var downloadTarget by uiState.state<GeneratedShare?>(prefix + "downloadTarget") { null }
    var downloadTargetIsTransient by uiState.state(prefix + "downloadTargetTransient") { true }
    val downloadLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("*/*")) { uri ->
        val pending = downloadTarget
        downloadTarget = null
        if (pending != null) uiState.launch {
            if (uri != null) runCatching { LocalFiles.download(context, uri, pending.bytes) }
                .onFailure { error = context.localizedError(it) }
            if (downloadTargetIsTransient) pending.clearMemory()
        }
    }
    val passwordMismatch = stringResource(R.string.passwords_mismatch)
    val passwordRequirements = stringResource(R.string.password_requirements)
    val passwordMeetsRequirements = remember(password) { ArchivePasswordPolicy.accepts(password) }
    val layoutState = remember(people, relationships, pointOfView, generationLimits, locale) {
        mutableStateOf<TreeLayoutResult?>(null)
    }
    val layout by layoutState
    LaunchedEffect(people, relationships, pointOfView, generationLimits, locale) {
        layoutState.value = withContext(Dispatchers.Default) {
            TreeLayout.make(
                null, people.snapshots(locale), relationships.snapshots(), pointOfView,
                generationLimits, semanticFormatter(locale),
            )
        }
    }
    val base = remember(tree.title) {
        tree.title.replace(Regex("[^A-Za-z0-9]+"), "-").trim('-').ifEmpty { "Heritg-Family-Tree" } + "-${LocalDate.now()}"
    }
    fun offerExport(share: GeneratedShare, transient: Boolean) {
        exportSheetIsTransient = transient
        exportSheet = share
    }
    fun closeExportSheet() {
        if (exportSheetIsTransient) exportSheet?.clearMemory()
        exportSheet = null
    }
    fun prepare(name: String, mime: String, block: () -> ByteArray) {
        working = true; error = null
        uiState.launch {
            try {
                val generated = withContext(Dispatchers.Default) { block() }
                offerExport(GeneratedShare(generated, name, mime), transient = true)
            } catch (failure: Throwable) {
                error = context.localizedError(failure)
            }
            working = false
        }
    }
    fun prepareArchive() {
        if (!passwordMeetsRequirements) {
            error = passwordRequirements
            return
        }
        if (password != confirmation) {
            error = passwordMismatch
            return
        }
        val enteredPassword = password
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
                    LocalFiles.EncryptedArchiveMime,
                )
            }.onFailure { error = context.localizedError(it) }
            working = false
        }
    }
    val keyboardActions = rememberFormKeyboardActions()
    val confirmationKeyboardActions = rememberFormKeyboardActions {
        if (!working && passwordMeetsRequirements && password == confirmation
        ) prepareArchive()
    }
    val passwordsDoNotMatch = confirmation.isNotEmpty() && password != confirmation
    LaunchedEffect(error) { if (error != null) errorFocus.requestFocus() }
    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).imePadding().padding(20.dp)) {
        Text(stringResource(R.string.export_heading), Modifier.semantics { heading() },
            style = MaterialTheme.typography.titleLarge)
        Text(stringResource(R.string.export_copy), color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(16.dp))
        Column(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface, RoundedCornerShape(14.dp)).padding(14.dp)) {
            Text(stringResource(R.string.point_of_view), Modifier.semantics { heading() },
                style = MaterialTheme.typography.titleMedium)
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
            TreePngExporter.export(current, pointOfView != null, locale = locale, textMeasurer = textMeasurer)
        } } }, enabled = !working && layout != null, modifier = Modifier.fillMaxWidth().testTag("settings.exportPNG")) { Text(stringResource(R.string.export_png)) }
        OutlinedButton(onClick = { layout?.let { current -> prepare("$base-Chart.svg", "image/svg+xml") {
            TreeSvgExporter.export(
                current, pointOfView != null, locale = locale, textMeasurer = textMeasurer,
            ).encodeToByteArray()
        } } }, enabled = !working && layout != null, modifier = Modifier.fillMaxWidth().testTag("settings.exportSVG")) { Text(stringResource(R.string.export_svg)) }
        OutlinedButton(onClick = { prepare("$base.ged", "text/plain") {
            GedcomExporter.export(people, relationships).encodeToByteArray()
        } }, enabled = !working, modifier = Modifier.fillMaxWidth().testTag("settings.exportGEDCOM")) { Text(stringResource(R.string.export_gedcom)) }
        Spacer(Modifier.height(20.dp))
        Text(stringResource(R.string.heritg_backup), Modifier.semantics { heading() },
            style = MaterialTheme.typography.titleMedium)
        Text(stringResource(R.string.backup_copy), color = MaterialTheme.colorScheme.primary)
        Text(
            stringResource(R.string.every_backup_encrypted),
            color = MaterialTheme.colorScheme.primary,
            style = MaterialTheme.typography.titleSmall,
        )
        Text(stringResource(R.string.password_restore_notice), color = MaterialTheme.colorScheme.primary)
        OutlinedTextField(password, { password = it; generatedArchive?.clearMemory(); generatedArchive = null; error = null },
            Modifier.fillMaxWidth().contentType(ContentType.NewPassword).semantics { isSensitiveData = true }
                .testTag("settings.archivePassword"),
            label = { Text(stringResource(R.string.password_optional)) }, visualTransformation = PasswordVisualTransformation(),
            singleLine = true, enabled = !working,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Next),
            keyboardActions = keyboardActions)
        OutlinedTextField(confirmation, { confirmation = it; generatedArchive?.clearMemory(); generatedArchive = null; error = null },
            Modifier.fillMaxWidth().contentType(ContentType.NewPassword).semantics { isSensitiveData = true }
                .testTag("settings.archivePasswordConfirmation"),
            label = { Text(stringResource(R.string.confirm_password)) }, visualTransformation = PasswordVisualTransformation(),
            singleLine = true, enabled = !working, isError = passwordsDoNotMatch,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
            keyboardActions = confirmationKeyboardActions)
        if (passwordsDoNotMatch) Text(
            passwordMismatch, color = MaterialTheme.colorScheme.error,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive; this.error(passwordMismatch) }
                .testTag("settings.passwordMismatch"),
        )
        if (!passwordMeetsRequirements) Text(
            passwordRequirements, color = MaterialTheme.colorScheme.error,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive; this.error(passwordRequirements) }
                .testTag("settings.passwordRequirements"),
        )
        Button(onClick = ::prepareArchive,
            enabled = !working && password == confirmation && passwordMeetsRequirements,
            modifier = Modifier.fillMaxWidth().testTag("settings.exportHeritg")) {
            Text(if (working) stringResource(R.string.creating_backup) else stringResource(R.string.create_backup))
        }
        if (working) CircularProgressIndicator(Modifier.testTag("settings.exportProgress"))
        generatedArchive?.let { share -> OutlinedButton(onClick = { offerExport(share, transient = false) },
            modifier = Modifier.fillMaxWidth().testTag("settings.shareHeritg")) {
            Text(stringResource(R.string.share_backup))
        } }
        error?.let { message -> Text(message, color = MaterialTheme.colorScheme.error,
            modifier = Modifier.focusRequester(errorFocus).focusable()
                .semantics { liveRegion = LiveRegionMode.Assertive; this.error(message) }.testTag("settings.exportError")) }
        Spacer(Modifier.height(32.dp))
    }
    exportSheet?.let { share -> ExportOptionsSheet(
        name = share.name,
        onClose = ::closeExportSheet,
        onShare = {
            uiState.launch {
                runCatching { LocalFiles.share(context, share.bytes, share.name, share.mime) }
                    .onFailure { error = context.localizedError(it) }
                closeExportSheet()
            }
        },
        onDownload = {
            downloadTarget = share
            downloadTargetIsTransient = exportSheetIsTransient
            downloadLauncher.launch(share.name)
            exportSheet = null
        },
    ) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ExportOptionsSheet(name: String, onClose: () -> Unit, onShare: () -> Unit, onDownload: () -> Unit) {
    val state = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = onClose, sheetState = state, containerColor = MaterialTheme.colorScheme.background) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp)) {
            Text(name, style = MaterialTheme.typography.titleMedium, maxLines = 1)
            Spacer(Modifier.height(12.dp))
            ExportOptionRow(R.drawable.ic_share, stringResource(R.string.share), "settings.exportSheet.share", onShare)
            ExportOptionRow(R.drawable.ic_download, stringResource(R.string.download), "settings.exportSheet.download", onDownload)
            Spacer(Modifier.height(12.dp))
        }
    }
}

@Composable
private fun ExportOptionRow(icon: Int, label: String, tag: String, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).sizeIn(minHeight = 56.dp).testTag(tag),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(painterResource(icon), contentDescription = null, tint = MaterialTheme.colorScheme.onSurface)
        Spacer(Modifier.width(16.dp))
        Text(label, style = MaterialTheme.typography.bodyLarge)
    }
}

@Composable
private fun selectedLanguageName(): String {
    val tag = AppCompatDelegate.getApplicationLocales().toLanguageTags()
    val language = tag.ifEmpty { LocalConfiguration.current.locales[0].language }
    return if (language.startsWith("id")) "Bahasa Indonesia" else "English"
}
