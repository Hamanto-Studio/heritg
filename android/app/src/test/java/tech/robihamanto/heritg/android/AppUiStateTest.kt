package tech.robihamanto.heritg.android

import androidx.lifecycle.SavedStateHandle
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import tech.robihamanto.heritg.android.core.domain.RelativeRole
import tech.robihamanto.heritg.android.core.tree.TreeGenerationLimits

class AppUiStateTest {
    @Test
    fun routeStackRestoresAndBackReturnsToPreviousTree() {
        val handle = SavedStateHandle()
        val state = AppUiState(handle)

        state.initializeNavigation("first")
        state.openLibrary()
        state.openTree("second")

        val restored = AppUiState(handle)
        assertEquals("second", restored.activeTreeId)
        assertFalse(restored.libraryVisible)
        assertTrue(restored.canNavigateBack)

        assertTrue(restored.navigateBack())
        assertTrue(restored.libraryVisible)
        assertEquals("first", restored.activeTreeId)
    }

    @Test
    fun simpleDraftsAndDestinationsRestoreButSecretsDoNot() {
        val handle = SavedStateHandle()
        val state = AppUiState(handle)
        val draft = state.state("editor:person:name") { "Initial" }
        val password = state.state("settings:tree:export:password") { "" }
        val confirmation = state.state("settings:tree:export:confirmation") { "" }
        val working = state.state("settings:tree:export:working") { false }
        val nullableRole = state.state<RelativeRole?>("add:person:role") { null }

        draft.value = "Restored draft"
        password.value = "not-persisted"
        confirmation.value = "also-not-persisted"
        working.value = true
        nullableRole.value = RelativeRole.FATHER
        state.show(Overlay.Settings("tree", TreeGenerationLimits(2, 3)))

        val restored = AppUiState(handle)
        assertEquals("Restored draft", restored.state("editor:person:name") { "Initial" }.value)
        assertEquals("", restored.state("settings:tree:export:password") { "" }.value)
        assertEquals("", restored.state("settings:tree:export:confirmation") { "" }.value)
        assertFalse(restored.state("settings:tree:export:working") { false }.value)
        assertNull(restored.state<RelativeRole?>("add:person:role") { null }.value)
        assertEquals(Overlay.Settings("tree", TreeGenerationLimits(2, 3)), restored.overlay)

        restored.show(Overlay.Password(byteArrayOf(1), "backup.heritg"))
        assertNull(AppUiState(handle).overlay)
    }

    @Test
    fun deletingOnlyRoutedTreeKeepsFallbackBehindLibrary() {
        val state = AppUiState(SavedStateHandle())
        state.initializeNavigation("deleted")
        state.openLibrary()

        state.removeTree("deleted", "fallback")

        assertTrue(state.libraryVisible)
        assertTrue(state.canNavigateBack)
        assertTrue(state.navigateBack())
        assertEquals("fallback", state.activeTreeId)
    }

    @Test
    fun complexEditorDraftDoesNotRestoreAsAPartialDraft() {
        val handle = SavedStateHandle()
        val state = AppUiState(handle)
        state.show(Overlay.Edit("person"))
        state.state("editor:person:name") { "Initial" }.value = "Draft"

        state.keepDraftInMemory("editor:person:")
        state.state("editor:person:city") { "" }.value = "Jakarta"

        val restored = AppUiState(handle)
        assertNull(restored.overlay)
        assertEquals("Initial", restored.state("editor:person:name") { "Initial" }.value)
        assertEquals("", restored.state("editor:person:city") { "" }.value)
    }

    @Test
    fun deletingTreeFromLongHistoryCollapsesAdjacentLibraryRoutes() {
        val state = AppUiState(SavedStateHandle())
        state.initializeNavigation("first")
        state.openLibrary()
        state.openTree("deleted")
        state.openLibrary()

        state.removeTree("deleted", "first")

        assertTrue(state.navigateBack())
        assertEquals("first", state.activeTreeId)
        assertFalse(state.libraryVisible)
        assertFalse(state.canNavigateBack)
    }
}
