package tech.robihamanto.heritg.android

import java.time.Instant
import java.time.LocalDate
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import tech.robihamanto.heritg.android.core.interop.ArchivePayload
import tech.robihamanto.heritg.android.core.model.FamilyRelationship
import tech.robihamanto.heritg.android.core.model.FamilyTree
import tech.robihamanto.heritg.android.core.model.GenealogyDates
import tech.robihamanto.heritg.android.core.model.Person
import tech.robihamanto.heritg.android.core.model.PersonGender
import tech.robihamanto.heritg.android.core.model.RelationshipKind
import tech.robihamanto.heritg.android.core.model.RelationshipSubtype

class DebugHeritgApplication : HeritgApplication() {
    override fun onCreate() {
        super.onCreate()
        runBlocking(Dispatchers.IO) {
            val trees = familyRepository.observeTrees().first()
            var fixture = trees.firstOrNull { it.id == FixtureTreeId }
            val created = fixture == null
            if (fixture == null) {
                fixture = runCatching { familyRepository.importPayload(debugFixture()) }.getOrNull()
            }
            if (fixture != null && (created || preferences.selectedTreeId.first() == null)) {
                preferences.setSelectedTreeId(fixture.id)
            }
        }
    }

    private fun debugFixture(): ArchivePayload {
        val people = listOf(
            person(
                "soekemi",
                "Raden Soekemi Sosrodihardjo",
                PersonGender.MALE,
                0,
                "1873-06-15",
                "1945-05-18"
            ),
            person(
                "ida-ayu",
                "Ida Ayu Nyoman Rai",
                PersonGender.FEMALE,
                1,
                "1881-01-01",
                "1958-09-12"
            ),
            person("sukarno", "Sukarno", PersonGender.MALE, 2, "1901-06-06", "1970-06-21"),
            person("fatmawati", "Fatmawati", PersonGender.FEMALE, 3, "1923-02-05", "1980-05-14"),
            person("guntur", "Guntur Soekarnoputra", PersonGender.MALE, 4, "1944-11-03"),
            person("megawati", "Megawati Soekarnoputri", PersonGender.FEMALE, 5, "1947-01-23"),
            person(
                "rachmawati",
                "Rachmawati Soekarnoputri",
                PersonGender.FEMALE,
                6,
                "1950-09-27",
                "2021-07-03"
            ),
            person("sukmawati", "Sukmawati Soekarnoputri", PersonGender.FEMALE, 7, "1951-10-26"),
            person("guruh", "Guruh Soekarnoputra", PersonGender.MALE, 8, "1953-01-13"),
            person("taufiq", "Taufiq Kiemas", PersonGender.MALE, 9, "1942-12-31", "2013-06-08"),
            person("puan", "Puan Maharani", PersonGender.FEMALE, 10, "1973-09-06"),
            person("hapsoro", "Hapsoro Sukmonohadi", PersonGender.MALE, 11),
            person("pinka", "Diah Pikatan Orissa Putri Hapsari", PersonGender.FEMALE, 12),
            person("praba", "Praba Diwangkata Craka Putra Soma", PersonGender.MALE, 13),
        )
        val parentPairs = listOf(
            "soekemi" to "sukarno", "ida-ayu" to "sukarno",
            "sukarno" to "guntur", "fatmawati" to "guntur",
            "sukarno" to "megawati", "fatmawati" to "megawati",
            "sukarno" to "rachmawati", "fatmawati" to "rachmawati",
            "sukarno" to "sukmawati", "fatmawati" to "sukmawati",
            "sukarno" to "guruh", "fatmawati" to "guruh",
            "megawati" to "puan", "taufiq" to "puan",
            "puan" to "pinka", "hapsoro" to "pinka",
            "puan" to "praba", "hapsoro" to "praba",
        )
        val relationships = parentPairs.mapIndexed { index, (parent, child) ->
            FamilyRelationship(
                id = "parent-$parent-$child",
                treeId = FixtureTreeId,
                fromPersonId = parent,
                toPersonId = child,
                kind = RelationshipKind.PARENT,
                createdAt = Instant.ofEpochSecond(index.toLong()),
            )
        } + listOf(
            spouse("sukarno", "fatmawati", 18, "1943-06-01"),
            spouse("megawati", "taufiq", 19, "1973-03-27"),
            spouse("puan", "hapsoro", 20),
        )
        return ArchivePayload(
            exportedAt = Instant.EPOCH,
            tree = FamilyTree(
                id = FixtureTreeId,
                title = "Sukarno Family",
                createdAt = Instant.EPOCH,
                updatedAt = Instant.EPOCH,
                lastSelectedPersonId = "soekemi",
            ),
            people = people,
            relationships = relationships,
        )
    }

    private fun person(
        id: String,
        name: String,
        gender: PersonGender,
        order: Long,
        birthDate: String? = null,
        deathDate: String? = null,
    ) = Person(
        id = id,
        treeId = FixtureTreeId,
        displayName = name,
        gender = gender,
        createdAt = Instant.ofEpochSecond(order),
        birthDate = birthDate?.let(::date),
        deathDate = deathDate?.let(::date),
    )

    private fun spouse(
        first: String,
        second: String,
        order: Long,
        marriageDate: String? = null
    ): FamilyRelationship {
        val (from, to) = listOf(first, second).sorted()
        return FamilyRelationship(
            id = "partner-$first-$second",
            treeId = FixtureTreeId,
            fromPersonId = from,
            toPersonId = to,
            kind = RelationshipKind.PARTNER,
            subtype = RelationshipSubtype.SPOUSE,
            createdAt = Instant.ofEpochSecond(order),
            marriageDate = marriageDate?.let(::date),
        )
    }

    private fun date(value: String) = GenealogyDates.fromCalendarDate(LocalDate.parse(value))

    private companion object {
        const val FixtureTreeId = "debug-sukarno-puan-tree"
    }
}
