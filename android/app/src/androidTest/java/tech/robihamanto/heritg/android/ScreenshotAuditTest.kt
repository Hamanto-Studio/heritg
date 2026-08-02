package tech.robihamanto.heritg.android

import android.os.ParcelFileDescriptor
import android.os.SystemClock
import androidx.appcompat.app.AppCompatDelegate
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.v2.createEmptyComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.core.os.LocaleListCompat
import androidx.test.core.app.ActivityScenario
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.Rule
import org.junit.Test
import tech.robihamanto.heritg.android.core.interop.ArchivePayload
import tech.robihamanto.heritg.android.core.model.FamilyRelationship
import tech.robihamanto.heritg.android.core.model.FamilyTree
import tech.robihamanto.heritg.android.core.model.GenealogyDates
import tech.robihamanto.heritg.android.core.model.Person
import tech.robihamanto.heritg.android.core.model.PersonGender
import tech.robihamanto.heritg.android.core.model.RelationshipKind
import tech.robihamanto.heritg.android.core.model.RelationshipSubtype
import java.time.Instant
import java.time.LocalDate

class ScreenshotAuditTest {
    @get:Rule
    val compose = createEmptyComposeRule()

    @Test
    fun capturesCanonicalJourneysInEnglishAndIndonesian() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val application = instrumentation.targetContext.applicationContext as HeritgApplication
        runBlocking {
            application.familyRepository.observeTrees().first().forEach {
                application.familyRepository.deleteTree(it.id)
            }
            application.familyRepository.importPayload(fixture())
            application.preferences.setSelectedTreeId(TreeId)
            application.preferences.setLanguageTag("en-US")
        }
        setNightMode(AppCompatDelegate.MODE_NIGHT_YES)
        setLocale("en-US")

        val scenario = ActivityScenario.launch(MainActivity::class.java)
        try {
            captureJourney("en-US", "All people", scenario)
            runBlocking { application.preferences.setLanguageTag("id") }
            setLocale("id")
            captureJourney("id", "Semua orang", scenario)
        } finally {
            scenario.close()
            runBlocking {
                application.familyRepository.observeTrees().first().forEach {
                    application.familyRepository.deleteTree(it.id)
                }
                application.preferences.setSelectedTreeId(null)
                application.preferences.setLanguageTag(null)
            }
            setLocale("")
            setNightMode(AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM)
        }
    }

    private fun captureJourney(locale: String, peopleLabel: String, scenario: ActivityScenario<MainActivity>) {
        compose.waitUntil(10_000) {
            compose.onAllNodes(hasContentDescription(peopleLabel), true)
                .fetchSemanticsNodes().isNotEmpty()
        }
        SystemClock.sleep(8_000)
        compose.onNodeWithTag("tree.fit", true).performClick()
        capture(locale, "01_FamilyTree")

        compose.onNodeWithTag("tree.people", true).performClick()
        compose.onNodeWithTag("people.close", true).assertIsDisplayed()
        capture(locale, "02_AllPeople")
        compose.onNodeWithTag("people.row.$SariId", true).performClick()

        compose.onNodeWithTag("person.edit.$SariId", true).assertIsDisplayed()
        compose.onNodeWithTag("person.edit.$SariId", true).performClick()
        compose.onNodeWithTag("person.close", true).assertIsDisplayed()
        capture(locale, "03_PersonDetails")
        compose.onNodeWithTag("relationship.edit.audit-partner", true).performScrollTo().performClick()
        compose.onNodeWithTag("relationship.edit.role.formerHusband", true).performScrollTo().performClick()
        compose.waitUntil(5_000) {
            runCatching {
                compose.onNodeWithTag("relationship.edit.role.formerHusband", true).assertIsSelected()
                true
            }.getOrDefault(false)
        }
        scenario.recreate()
        capture(locale, "04_RelationshipRotation")
        compose.waitUntil(5_000) {
            runCatching {
                compose.onNodeWithTag("relationship.edit.role.formerHusband", true).assertIsSelected()
                true
            }.getOrDefault(false)
        }
        compose.onNodeWithTag("relationship.edit.cancel", true).performClick()
        compose.onNodeWithTag("person.close", true).performClick()
    }

    private fun capture(locale: String, name: String) {
        compose.waitForIdle()
        SystemClock.sleep(500)
        val directory = "/sdcard/Download/Heritg/screenshots/$locale"
        val file = "$directory/$name.png"
        shell("mkdir -p $directory")
        shell("rm -rf $file")
        shell("screencap -p $file")
        check(shell("stat -c %s $file").trim().toLongOrNull()?.let { it > 0 } == true) {
            "Screenshot was not written: $file"
        }
    }

    private fun setLocale(languageTag: String) {
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(languageTag))
        }
    }

    private fun setNightMode(mode: Int) {
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            AppCompatDelegate.setDefaultNightMode(mode)
        }
    }

    private fun shell(command: String): String {
        val descriptor = InstrumentationRegistry.getInstrumentation().uiAutomation
            .executeShellCommand(command)
        return ParcelFileDescriptor.AutoCloseInputStream(descriptor).use {
            it.readBytes().decodeToString()
        }
    }

    private fun fixture(): ArchivePayload {
        val base = Instant.parse("2026-01-01T00:00:00Z")
        val people = listOf(
            Person(RinaId, TreeId, "Rina", PersonGender.UNSPECIFIED, base.plusSeconds(1), date(1988)),
            Person("audit-budi", TreeId, "Budi", PersonGender.MALE, base.plusSeconds(2), date(1960)),
            Person(SariId, TreeId, "Sari", PersonGender.FEMALE, base.plusSeconds(3), date(1963)),
            Person("audit-arif", TreeId, "Arif", PersonGender.UNSPECIFIED, base.plusSeconds(4), date(1961)),
            Person("audit-nadia", TreeId, "Nadia", PersonGender.FEMALE, base.plusSeconds(5), date(1990)),
            Person("audit-rafi", TreeId, "Rafi", PersonGender.MALE, base.plusSeconds(6), date(1992)),
        )
        val relationships = listOf(
            relationship("father", "audit-budi", RinaId, RelationshipKind.PARENT, base.plusSeconds(7)),
            relationship("mother", SariId, "audit-budi", RelationshipKind.PARENT, base.plusSeconds(8)),
            relationship("partner", "audit-arif", SariId, RelationshipKind.PARTNER, base.plusSeconds(9)),
            relationship("daughter", SariId, "audit-nadia", RelationshipKind.PARENT, base.plusSeconds(10)),
            relationship("son", SariId, "audit-rafi", RelationshipKind.PARENT, base.plusSeconds(11)),
        )
        return ArchivePayload(
            exportedAt = base.plusSeconds(12),
            tree = FamilyTree(TreeId, "Rina Family", base, base, SariId),
            people = people,
            relationships = relationships,
        )
    }

    private fun relationship(
        id: String,
        from: String,
        to: String,
        kind: RelationshipKind,
        createdAt: Instant,
    ) = FamilyRelationship(
        id = "audit-$id",
        treeId = TreeId,
        fromPersonId = from,
        toPersonId = to,
        kind = kind,
        subtype = if (kind == RelationshipKind.PARTNER) RelationshipSubtype.SPOUSE
            else RelationshipSubtype.defaultFor(kind),
        createdAt = createdAt,
        marriageDate = date(1985).takeIf { kind == RelationshipKind.PARTNER },
    )

    private fun date(year: Int): Instant = GenealogyDates.fromCalendarDate(LocalDate.of(year, 1, 1))

    private companion object {
        const val TreeId = "audit-tree"
        const val RinaId = "audit-rina"
        const val SariId = "audit-sari"
    }
}
