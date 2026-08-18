package tech.robihamanto.heritg.android.core.interop

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import tech.robihamanto.heritg.android.core.model.BirthDatePrecision
import tech.robihamanto.heritg.android.core.model.FamilyRelationship
import tech.robihamanto.heritg.android.core.model.FamilyTree
import tech.robihamanto.heritg.android.core.model.Person
import tech.robihamanto.heritg.android.core.model.PersonGender
import tech.robihamanto.heritg.android.core.model.RelationshipKind
import tech.robihamanto.heritg.android.core.model.RelationshipSubtype
import java.io.ByteArrayOutputStream
import java.io.File
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

class HeritgArchiveCodecTest {
    private val codec = HeritgArchiveCodec()

    @Test fun optionalPasswordPolicyMatchesEveryWriter() {
        assertTrue(ArchivePasswordPolicy.accepts(""))
        assertTrue(ArchivePasswordPolicy.accepts("Pass123!"))
        assertTrue(ArchivePasswordPolicy.accepts("Ångström1!"))
        assertFalse(ArchivePasswordPolicy.accepts("Pass1"))
        assertFalse(ArchivePasswordPolicy.accepts("password1"))
        assertFalse(ArchivePasswordPolicy.accepts("PASSWORD1"))
        assertFalse(ArchivePasswordPolicy.accepts("Password"))
        assertFalse(ArchivePasswordPolicy.accepts("Pass1234"))
    }

    @Test fun outputMatchesIosEncryptedCompatibilityVectorExactly() {
        val salt = ByteArray(16) { it.toByte() }
        val nonce = ByteArray(12) { (it + 16).toByte() }
        val decomposed = "Cafe\u0301 family"
        val composed = "Café family"

        val first = codec.encode(validPayload(), decomposed, salt, nonce)
        val second = codec.encode(validPayload(), composed, salt, nonce)

        assertArrayEquals(first, second)
        assertEquals("HTGENC01", first.copyOfRange(0, 8).decodeToString())
        assertArrayEquals(byteArrayOf(0, 1, 1, 1, 0, 9, 39, 192.toByte()), first.copyOfRange(8, 16))
        assertEquals("2806b437258da23ca3e0f1f57df81ae69467869ed9d9e8e0c84e00cb9bcd2780", sha256(first))
        assertEquals("tree-synthetic", codec.decode(first, composed).tree.id)

        val wrongRounds = first.copyOf().also { it[15] = (it[15].toInt() xor 1).toByte() }
        assertThrows(ArchiveException.InvalidArchive::class.java) { codec.decode(wrongRounds, composed) }
        val tampered = first.copyOf().also { it[it.lastIndex - 20] = (it[it.lastIndex - 20].toInt() xor 1).toByte() }
        assertThrows(ArchiveException.WrongPasswordOrCorrupt::class.java) { codec.decode(tampered, composed) }
    }

    @Test fun emptyPasswordStillProducesEncryptedArchiveAndRestoresWithoutPrompt() {
        val salt = ByteArray(16) { it.toByte() }
        val nonce = ByteArray(12) { (it + 16).toByte() }
        val archive = codec.encode(validPayload(), "", salt, nonce)

        assertEquals(ArchiveProtection.ENCRYPTED, codec.protection(archive))
        assertEquals("bc8df41b6991455fdad8150c610e56f32d0146ee117bbb7cb2636d3732595440", sha256(archive))
        assertEquals("tree-synthetic", codec.decode(archive, "").tree.id)
    }

    @Test fun generatedSchemaMatchesAndReaderConsumesSharedExplodedFixture() {
        val expected = fixtureFiles()
        val actual = codec.exploded(fixturePayload())
        assertEquals(expected.keys, actual.keys)
        assertEquals(
            expected.getValue(ArchiveConstants.ManifestPath).decodeToString().trimEnd('\n'),
            actual.getValue(ArchiveConstants.ManifestPath).decodeToString(),
        )
        assertEquals(
            expected.getValue(ArchiveConstants.TreePath).decodeToString().trimEnd('\n'),
            actual.getValue(ArchiveConstants.TreePath).decodeToString(),
        )
        assertEquals(
            expected.getValue(ArchiveConstants.PeoplePath).decodeToString()
                .replace("\"deathDate\":null,", "")
                .replace("\"profilePhoto\":null,", ""),
            actual.getValue(ArchiveConstants.PeoplePath).decodeToString(),
        )
        assertArrayEquals(
            expected.getValue(ArchiveConstants.RelationshipsPath),
            actual.getValue(ArchiveConstants.RelationshipsPath),
        )

        val decoded = codec.decode(HeritgZip.encode(expected))
        assertEquals("fixture-tree", decoded.tree.id)
        assertEquals(listOf("fixture-person-a", "fixture-person-b"), decoded.people.map { it.id })
        assertEquals("2015-06-20", ArchiveDates.calendarDate(decoded.relationships.single().marriageDate))
    }

    @Test fun zipRoundTripPreservesFieldsMediaReferenceAndStoredProfile() {
        val payload = validPayload()
        val archive = codec.encode(payload)
        assertEquals(ArchiveProtection.UNENCRYPTED, codec.protection(archive))
        assertArrayEquals(ArchiveConstants.ZipMagic, archive.copyOfRange(0, 4))
        val files = HeritgZip.decode(archive)
        val mediaPath = files.keys.single { it.startsWith(ArchiveConstants.MediaPrefix) }
        assertTrue(mediaPath.endsWith(".png"))
        assertTrue(files.getValue(ArchiveConstants.PeoplePath).decodeToString().contains("\"profilePhoto\":{\"byteSize\":11"))

        val decoded = codec.decode(archive)
        assertEquals(payload.exportedAt, decoded.exportedAt)
        assertEquals(payload.tree, decoded.tree)
        assertEquals(payload.people.map { it.id }, decoded.people.map { it.id })
        assertEquals(payload.relationships.map { it.id }, decoded.relationships.map { it.id })
        assertArrayEquals(payload.people.first().profilePhotoData, decoded.people.first().profilePhotoData)
        assertEquals("1985-04-12", ArchiveDates.calendarDate(decoded.people.first().birthDate))
    }

    @Test fun jsonLinesRequireFinalLfAndEmptyCollectionsAreZeroBytes() {
        val empty = ArchivePayload(
            Instant.parse("2026-01-02T03:04:05Z"),
            FamilyTree("empty-tree", "Empty", Instant.EPOCH, Instant.EPOCH),
            emptyList(),
            emptyList(),
        )
        val emptyFiles = codec.exploded(empty)
        assertEquals(0, emptyFiles.getValue(ArchiveConstants.PeoplePath).size)
        assertEquals(0, emptyFiles.getValue(ArchiveConstants.RelationshipsPath).size)
        assertTrue(codec.decode(HeritgZip.encode(emptyFiles)).people.isEmpty())

        val files = codec.exploded(fixturePayload()).toMutableMap()
        files[ArchiveConstants.PeoplePath] = files.getValue(ArchiveConstants.PeoplePath).dropLast(1).toByteArray()
        files[ArchiveConstants.ChecksumsPath] = checksums(files - ArchiveConstants.ChecksumsPath)
        assertThrows(ArchiveException.InvalidArchive::class.java) { codec.decode(HeritgZip.encode(files)) }
    }

    @Test fun strictZipChecksumPathAndUnexpectedEntriesAreRejected() {
        val files = codec.exploded(fixturePayload()).toMutableMap()
        files[ArchiveConstants.TreePath] = files.getValue(ArchiveConstants.TreePath) + 'x'.code.toByte()
        assertThrows(ArchiveException.InvalidArchive::class.java) { codec.decode(HeritgZip.encode(files)) }
        assertThrows(ArchiveException.InvalidArchive::class.java) {
            HeritgZip.encode(mapOf("../tree.json" to byteArrayOf()))
        }

        val deflated = ByteArrayOutputStream().also { output ->
            ZipOutputStream(output).use { zip ->
                zip.putNextEntry(ZipEntry("tree.json"))
                zip.write(byteArrayOf(1))
                zip.closeEntry()
            }
        }.toByteArray()
        assertThrows(ArchiveException.InvalidArchive::class.java) { HeritgZip.decode(deflated) }

        val extra = codec.exploded(fixturePayload()).toMutableMap()
        extra["unexpected.json"] = "{}".encodeToByteArray()
        extra[ArchiveConstants.ChecksumsPath] = checksums(extra - ArchiveConstants.ChecksumsPath)
        assertThrows(ArchiveException.InvalidArchive::class.java) { codec.decode(HeritgZip.encode(extra)) }
    }

    @Test fun graphReferenceValidationRunsBeforeArchiveIsReturned() {
        val invalid = validPayload().copy(
            relationships = listOf(validPayload().relationships.first().copy(toPersonId = "missing")),
        )
        assertThrows(ArchiveException.InvalidArchive::class.java) { codec.encode(invalid) }
    }

    private fun validPayload(notes: String = "Synthetic notes only"): ArchivePayload {
        val tree = FamilyTree(
            "tree-synthetic",
            "Synthetic Family",
            Instant.ofEpochSecond(1_600_000_000),
            Instant.ofEpochSecond(1_700_000_000),
            "person-alpha",
        )
        val first = Person(
            id = "person-alpha",
            treeId = tree.id,
            displayName = "Ayu Élodie",
            gender = PersonGender.FEMALE,
            createdAt = Instant.ofEpochSecond(1_600_000_100),
            birthDate = date(1985, 4, 12),
            birthDatePrecision = BirthDatePrecision.EXACT,
            notes = notes,
            city = "Bandung",
            province = "West Java",
            country = "Indonesia",
            postalCode = "40123",
            profilePhotoData = byteArrayOf(0x89.toByte(), 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3),
        )
        val second = Person(
            id = "person-beta",
            treeId = tree.id,
            displayName = "Bima",
            gender = PersonGender.MALE,
            createdAt = Instant.ofEpochSecond(1_600_000_200),
            birthDate = date(1983, 9, 2),
            birthDatePrecision = BirthDatePrecision.MONTH,
        )
        val relationship = FamilyRelationship(
            id = "relationship-alpha-beta",
            treeId = tree.id,
            fromPersonId = first.id,
            toPersonId = second.id,
            kind = RelationshipKind.PARTNER,
            subtype = RelationshipSubtype.SPOUSE,
            createdAt = Instant.ofEpochSecond(1_650_000_000),
            marriageDate = date(2010, 6, 20),
        )
        return ArchivePayload(Instant.ofEpochSecond(1_700_000_000), tree, listOf(first, second), listOf(relationship))
    }

    private fun fixturePayload(): ArchivePayload {
        val tree = FamilyTree(
            "fixture-tree", "Synthetic Fixture", Instant.parse("2026-01-01T00:00:00Z"),
            Instant.parse("2026-01-02T03:04:05Z"), "fixture-person-a",
        )
        val people = listOf(
            Person(
                id = "fixture-person-a", treeId = tree.id, displayName = "Synthetic Person A",
                gender = PersonGender.FEMALE, createdAt = Instant.parse("2026-01-01T00:00:01Z"),
                birthDate = date(1990, 4, 12), notes = "No real family data", city = "Bandung",
                province = "West Java", country = "Indonesia",
            ),
            Person(
                id = "fixture-person-b", treeId = tree.id, displayName = "Synthetic Person B",
                gender = PersonGender.MALE, createdAt = Instant.parse("2026-01-01T00:00:02Z"),
                birthDate = date(1988, 9, 2), birthDatePrecision = BirthDatePrecision.MONTH,
            ),
        )
        val relationship = FamilyRelationship(
            "fixture-relationship", tree.id, people[0].id, people[1].id, RelationshipKind.PARTNER,
            RelationshipSubtype.SPOUSE, Instant.parse("2026-01-01T00:00:03Z"), date(2015, 6, 20),
        )
        return ArchivePayload(Instant.parse("2026-01-02T03:04:05Z"), tree, people, listOf(relationship))
    }

    private fun fixtureFiles(): Map<String, ByteArray> = listOf(
        ArchiveConstants.ManifestPath,
        ArchiveConstants.TreePath,
        ArchiveConstants.PeoplePath,
        ArchiveConstants.RelationshipsPath,
        ArchiveConstants.ChecksumsPath,
    ).associateWith { path ->
        File(checkNotNull(System.getProperty("heritg.compatibility.fixtures")), path).readBytes()
    }

    private fun date(year: Int, month: Int, day: Int): Instant =
        LocalDate.of(year, month, day).atStartOfDay(ZoneId.systemDefault()).toInstant()

    private fun checksums(files: Map<String, ByteArray>): ByteArray = files.keys.sorted().joinToString("") {
        "${sha256(files.getValue(it))}  $it\n"
    }.encodeToByteArray()
}
