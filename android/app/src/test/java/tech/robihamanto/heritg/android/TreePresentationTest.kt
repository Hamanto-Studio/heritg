package tech.robihamanto.heritg.android

import androidx.lifecycle.SavedStateHandle
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import tech.robihamanto.heritg.android.core.domain.PersonSnapshot
import tech.robihamanto.heritg.android.core.domain.RelativeRole
import tech.robihamanto.heritg.android.core.domain.semanticFormatter
import tech.robihamanto.heritg.android.core.model.PersonGender
import tech.robihamanto.heritg.android.core.model.BirthDatePrecision
import tech.robihamanto.heritg.android.core.model.Person
import tech.robihamanto.heritg.android.core.tree.TreeLayout
import java.util.Locale
import java.time.Instant

class TreePresentationTest {
    @Test
    fun logicalUnitsScaleAtMdpiXhdpiAndXxhdpi() {
        assertEquals(64f, logicalToPixels(64.0, 1f), 0f)
        assertEquals(128f, logicalToPixels(64.0, 2f), 0f)
        assertEquals(192f, logicalToPixels(64.0, 3f), 0f)
        assertEquals(-96f, logicalToPixels(-32.0, 3f), 0f)
    }

    @Test
    fun nodeControlsFollowTreeZoomWithoutAVisualFloor() {
        assertEquals(6.8f, nodeControlTargetSize(.2f), .001f)
        assertEquals(34f, nodeControlTargetSize(1f), .001f)
        assertEquals(61.2f, nodeControlTargetSize(1.8f), .001f)
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
    fun draftAgeUsesDeathDateOrTodayAndRejectsInvalidOrder() {
        assertEquals(42, draftAge("1980-05-10", "2022-05-10"))
        assertNull(draftAge("2022-05-10", "1980-05-10"))
        assertNull(draftAge("", "2022-05-10"))
    }

    @Test
    fun unchangedImportedBirthDateKeepsItsPrecision() {
        val original = Instant.parse("1901-01-01T00:00:00Z")

        assertEquals(
            BirthDatePrecision.YEAR,
            birthPrecisionForDraft("1901-01-01", original, BirthDatePrecision.YEAR),
        )
        assertEquals(
            BirthDatePrecision.EXACT,
            birthPrecisionForDraft("1901-02-03", original, BirthDatePrecision.YEAR),
        )
    }

    @Test
    fun coParentIsUsedOnlyForSupportedChildRoles() {
        assertEquals("partner", coParentForRole(RelativeRole.SON, "partner"))
        assertNull(coParentForRole(RelativeRole.STEPSON, "partner"))
        assertNull(coParentForRole(RelativeRole.PARTNER, "partner"))
    }

    @Test
    fun explicitlyReselectingAnInferredRoleRemainsAStagedEdit() {
        val relative = Person("relative", "tree", "Relative", PersonGender.UNSPECIFIED, Instant.EPOCH)
        val original = DraftLink(relative, RelativeRole.HUSBAND, inferGender = false)

        assertFalse(shouldStageRelationshipDraft(original, original))
        assertTrue(shouldStageRelationshipDraft(original.copy(inferGender = true), original))
    }

    @Test
    fun closingPasswordOverlayWipesMemoryOnlyState() {
        val uiState = AppUiState(SavedStateHandle())
        val bytes = byteArrayOf(1, 2, 3, 4)
        uiState.state("password:value") { "secret" }.value = "changed"
        uiState.show(Overlay.Password(bytes, "family.heritg"))

        uiState.closeOverlay()

        assertNull(uiState.overlay)
        assertEquals(listOf(0, 0, 0, 0), bytes.map { it.toInt() })
        assertEquals("fresh", uiState.state("password:value") { "fresh" }.value)
    }
}
