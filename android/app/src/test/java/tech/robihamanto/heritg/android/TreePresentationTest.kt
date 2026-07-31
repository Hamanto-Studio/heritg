package tech.robihamanto.heritg.android

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import tech.robihamanto.heritg.android.core.domain.PersonSnapshot
import tech.robihamanto.heritg.android.core.domain.semanticFormatter
import tech.robihamanto.heritg.android.core.model.PersonGender
import tech.robihamanto.heritg.android.core.tree.TreeLayout
import java.util.Locale

class TreePresentationTest {
    @Test
    fun logicalUnitsScaleAtMdpiXhdpiAndXxhdpi() {
        assertEquals(64f, logicalToPixels(64.0, 1f), 0f)
        assertEquals(128f, logicalToPixels(64.0, 2f), 0f)
        assertEquals(192f, logicalToPixels(64.0, 3f), 0f)
        assertEquals(-96f, logicalToPixels(-32.0, 3f), 0f)
    }

    @Test
    fun IndonesianFormatterIsUsedByTreeLayout() {
        val person = PersonSnapshot("person", "Ayu", PersonGender.FEMALE)
        val selected = TreeLayout.make(
            focusedPersonId = null,
            people = listOf(person),
            relationships = emptyList(),
            selectedPersonId = person.id,
            formatter = semanticFormatter(Locale.forLanguageTag("id")),
        )
        val namesOnly = TreeLayout.make(
            focusedPersonId = null,
            people = listOf(person),
            relationships = emptyList(),
            formatter = semanticFormatter(Locale.forLanguageTag("id")),
        )

        assertEquals("Anda", selected.nodes.single().role)
        assertEquals("Anggota keluarga", namesOnly.nodes.single().role)
    }

    @Test
    fun archiveMimeTypesMatchTheFormatContract() {
        assertEquals("application/vnd.heritg.family-archive", LocalFiles.EncryptedArchiveMime)
        assertEquals("application/vnd.heritg.family-archive+zip", LocalFiles.UnencryptedArchiveMime)
    }

    @Test
    fun closingPasswordOverlayWipesMemoryOnlyState() {
        val uiState = AppUiState()
        val bytes = byteArrayOf(1, 2, 3, 4)
        uiState.state("password:value") { "secret" }.value = "changed"
        uiState.show(Overlay.Password(bytes, "family.heritg"))

        uiState.closeOverlay()

        assertNull(uiState.overlay)
        assertEquals(listOf(0, 0, 0, 0), bytes.map { it.toInt() })
        assertEquals("fresh", uiState.state("password:value") { "fresh" }.value)
    }
}
