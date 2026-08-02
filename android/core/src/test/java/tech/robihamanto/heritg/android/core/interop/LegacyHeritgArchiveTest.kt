package tech.robihamanto.heritg.android.core.interop

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import tech.robihamanto.heritg.android.core.domain.PersonSnapshot
import tech.robihamanto.heritg.android.core.domain.RelationshipSnapshot
import tech.robihamanto.heritg.android.core.tree.TreeConnectionPlan
import tech.robihamanto.heritg.android.core.tree.TreeLayout
import java.io.File
import java.time.Instant
import java.util.Base64

class LegacyHeritgArchiveTest {
    private val codec = HeritgArchiveCodec()

    @Test fun exactLegacyMagicIsClassifiedAlongsideCurrentFormats() {
        assertEquals(ArchiveProtection.UNENCRYPTED, codec.protection(unencryptedFixture))
        assertEquals(ArchiveProtection.ENCRYPTED, codec.protection(encryptedFixture))
        assertEquals(ArchiveProtection.UNENCRYPTED, codec.protection(codec.encode(codec.decode(unencryptedFixture))))
        assertEquals(
            ArchiveProtection.ENCRYPTED,
            codec.protection(codec.encode(codec.decode(unencryptedFixture), "current-password")),
        )
        assertThrows(ArchiveException.InvalidArchive::class.java) {
            codec.protection("HERITG0payload".encodeToByteArray())
        }
    }

    @Test fun appleBinaryPlistMapsAllLegacyCodableFields() {
        val payload = codec.decode(unencryptedFixture)

        assertEquals(1, payload.schemaVersion)
        assertEquals("tree-synthetic", payload.tree.id)
        assertEquals("Legacy Synthetic Family", payload.tree.title)
        assertEquals("person-alpha", payload.tree.lastSelectedPersonId)
        assertEquals(Instant.ofEpochSecond(1_700_000_000), payload.exportedAt)
        assertEquals(listOf("person-alpha", "person-beta"), payload.people.map { it.id })
        assertEquals("Ayu Élodie", payload.people.first().displayName)
        assertEquals("Synthetic notes only", payload.people.first().notes)
        assertArrayEquals(
            byteArrayOf(0x89.toByte(), 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3),
            payload.people.first().profilePhotoData,
        )
        assertEquals("relationship-alpha-beta", payload.relationships.single().id)
    }

    @Test fun historicalEncryptionUsesRawUtf8PasswordAndRejectsWrongPassword() {
        val decomposedPassword = "Cafe\u0301 legacy"
        val payload = codec.decode(encryptedFixture, decomposedPassword)

        assertEquals("tree-synthetic", payload.tree.id)
        assertThrows(ArchiveException.WrongPasswordOrCorrupt::class.java) {
            codec.decode(encryptedFixture, "Café legacy")
        }
        assertThrows(ArchiveException.WrongPasswordOrCorrupt::class.java) {
            codec.decode(encryptedFixture, "wrong password")
        }
    }

    @Test fun malformedHeadersPlistsVersionsAndValidatedGraphsAreRejected() {
        val unencryptedVersion = unencryptedFixture.copyOf().also { it[9] = 2 }
        assertThrows(ArchiveException.UnsupportedVersion::class.java) { codec.decode(unencryptedVersion) }

        val encryptedVersion = encryptedFixture.copyOf().also { it[9] = 2 }
        assertThrows(ArchiveException.UnsupportedVersion::class.java) {
            codec.decode(encryptedVersion, "Cafe\u0301 legacy")
        }

        val badRounds = encryptedFixture.copyOf().also { bytes -> (10..13).forEach { bytes[it] = 0 } }
        assertThrows(ArchiveException.InvalidArchive::class.java) {
            codec.decode(badRounds, "Cafe\u0301 legacy")
        }
        val excessiveRounds = encryptedFixture.copyOf().also {
            byteArrayOf(0, 0x1e, 0x84.toByte(), 0x81.toByte()).copyInto(it, destinationOffset = 10)
        }
        assertThrows(ArchiveException.InvalidArchive::class.java) {
            codec.decode(excessiveRounds, "Cafe\u0301 legacy")
        }

        val malformedPlist = unencryptedFixture.copyOf().also { it[it.lastIndex] = 0 }
        assertThrows(ArchiveException.InvalidArchive::class.java) { codec.decode(malformedPlist) }
        assertThrows(ArchiveException.InvalidArchive::class.java) {
            codec.decode("HERITG00".encodeToByteArray())
        }
        assertThrows(ArchiveException.InvalidArchive::class.java) { codec.decode(invalidGraphFixture) }
    }

    @Test fun currentZipAndHtgenC01StillRoundTrip() {
        val payload = codec.decode(unencryptedFixture)
        val zip = codec.encode(payload)
        val encrypted = codec.encode(payload, "current-password")

        assertArrayEquals(ArchiveConstants.ZipMagic, zip.copyOfRange(0, ArchiveConstants.ZipMagic.size))
        assertEquals("HTGENC01", encrypted.copyOfRange(0, 8).decodeToString())
        assertEquals(payload.tree, codec.decode(zip).tree)
        assertEquals(
            payload.people.map { it.id },
            codec.decode(encrypted, "current-password").people.map { it.id },
        )
    }

    @Test fun repeatedPlistScalarsAreCachedWithoutBypassingLimits() {
        val plist = LegacyBinaryPlist(unencryptedFixture.copyOfRange(10, unencryptedFixture.size))
        val root = plist.dictionary(
            plist.rootReference,
            setOf("schemaVersion", "exportedAt", "tree", "people", "relationships"),
        )
        val person = plist.array(root.getValue("people"), ArchiveConstants.MaximumPeople).first()
        val values = plist.dictionary(
            person,
            setOf(
                "id", "treeID", "displayName", "genderRaw", "createdAt", "birthDate", "deathDate",
                "birthDatePrecisionRaw", "notes", "addressLine", "city", "province", "country",
                "postalCode", "profilePhotoData",
            ),
        )

        val photo = plist.data(values.getValue("profilePhotoData"), ArchiveConstants.MaximumMediaBytes)
        assertSame(photo, plist.data(values.getValue("profilePhotoData"), ArchiveConstants.MaximumMediaBytes))
        assertThrows(ArchiveException.MediaTooLarge::class.java) {
            plist.data(values.getValue("profilePhotoData"), 1)
        }
        plist.string(values.getValue("displayName"), ArchiveConstants.MaximumShortFieldBytes)
        assertThrows(ArchiveException.FieldTooLarge::class.java) {
            plist.string(values.getValue("displayName"), 1)
        }
    }

    @Test fun decodeExternalAcceptanceArchiveWhenProvided() {
        val path = System.getenv("HERITG_LEGACY_ACCEPTANCE")
        assumeTrue("HERITG_LEGACY_ACCEPTANCE is not set", !path.isNullOrBlank())
        val payload = codec.decode(File(path!!).readBytes(), System.getenv("HERITG_LEGACY_PASSWORD"))
        println(
            "LEGACY_ACCEPTANCE title=${payload.tree.title} people=${payload.people.size} " +
                "relationships=${payload.relationships.size}",
        )
        assertEquals(19, payload.people.size)
        assertEquals(28, payload.relationships.size)
        val people = payload.people.map {
            PersonSnapshot(it.id, it.displayName, it.gender, birthEpochMillis = it.birthDate?.toEpochMilli())
        }
        val relationships = payload.relationships.map {
            RelationshipSnapshot(it.id, it.fromPersonId, it.toPersonId, it.kind, it.subtype, it.marriageYear)
        }
        val layout = TreeLayout.make(null, people, relationships)
        val plan = TreeConnectionPlan.make(layout, true)
        val positions = layout.nodes.associate { it.id to it.position }
        val spanningRoute = plan.nonParentRoutes.firstOrNull { route ->
            val from = positions[route.edge.fromPersonId] ?: return@firstOrNull false
            val to = positions[route.edge.toPersonId] ?: return@firstOrNull false
            layout.nodes.any { node ->
                node.id != route.edge.fromPersonId && node.id != route.edge.toPersonId &&
                    node.position.y == from.y && node.position.y == to.y &&
                    node.position.x > minOf(from.x, to.x) && node.position.x < maxOf(from.x, to.x)
            }
        }
        assertNotNull(spanningRoute)
        assertTrue(spanningRoute!!.segments.size >= 3)
        assertTrue("Unexpected collisions: ${plan.obstacleCollisions}", plan.isValid)
    }

    private val unencryptedFixture: ByteArray
        get() = decodeFixture(UnencryptedBase64)
    private val encryptedFixture: ByteArray
        get() = decodeFixture(EncryptedBase64)
    private val invalidGraphFixture: ByteArray
        get() = decodeFixture(InvalidGraphBase64)

    private fun decodeFixture(value: String): ByteArray = Base64.getDecoder().decode(value.filterNot(Char::isWhitespace))

    private companion object {
        const val UnencryptedBase64 = """
            SEVSSVRHMDAAAWJwbGlzdDAw1QECAwQFBgcIEjJdc2NoZW1hVmVyc2lvblpleHBvcnRlZEF0VHRyZWVWcGVvcGxl
            XXJlbGF0aW9uc2hpcHMQATNBxYIUQAAAANUJCgsMDQ4PEAcRUmlkVXRpdGxlWWNyZWF0ZWRBdFl1cGRhdGVkQXRf
            EBRsYXN0U2VsZWN0ZWRQZXJzb25JRF50cmVlLXN5bnRoZXRpY18QF0xlZ2FjeSBTeW50aGV0aWMgRmFtaWx5M0HC
            hyPAAAAAXHBlcnNvbi1hbHBoYaITLN4JFBUWCxcYGRobHB0eHxEOICEiIyQlJicoKSorVnRyZWVJRFtkaXNwbGF5
            TmFtZVlnZW5kZXJSYXdZYmlydGhEYXRlXxAVYmlydGhEYXRlUHJlY2lzaW9uUmF3VW5vdGVzW2FkZHJlc3NMaW5l
            VGNpdHlYcHJvdmluY2VXY291bnRyeVpwb3N0YWxDb2RlXxAQcHJvZmlsZVBob3RvRGF0YWoAQQB5AHUAIADJAGwA
            bwBkAGkAZVZmZW1hbGUzQcKHI/IAAAAzwb15oUAAAABVZXhhY3RfEBRTeW50aGV0aWMgbm90ZXMgb25seVBXQmFu
            ZHVuZ1lXZXN0IEphdmFZSW5kb25lc2lhVTQwMTIzS4lQTkcNChoKAQID3AkUFRYLGBkaGxwdHi0OLi8wMSYmJiYm
            JltwZXJzb24tYmV0YVRCaW1hVG1hbGUzQcKHJCQAAABUeWVhcqEz2AkUNDU2Nws4OQ4RLTo7PD1cZnJvbVBlcnNv
            bklEWnRvUGVyc29uSURXa2luZFJhd1pzdWJ0eXBlUmF3XG1hcnJpYWdlRGF0ZV8QF3JlbGF0aW9uc2hpcC1hbHBo
            YS1iZXRhV3BhcnRuZXJWc3BvdXNlM0HEBJwAAAAAM0GxzuMAAAAAAAgAEwAhACwAMQA4AEYASABRAFwAXwBlAG8A
            eQCQAJ8AuQDCAM8A0gDvAPYBAgEMARYBLgE0AUABRQFOAVYBYQF0AYkBkAGZAaIBqAG/AcAByAHSAdwB4gHuAgcC
            EwIYAh0CJgIrAi0CPgJLAlYCXgJpAnYCkAKYAp8CqAAAAAAAAAIBAAAAAAAAAD4AAAAAAAAAAAAAAAAAAAKx
        """

        const val EncryptedBase64 = """
            SEVSSVRHMDEAAQABhqAAAQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobXU6KbwvT886LJdxlJG+oSAnJMbqyWGL7
            nxADhBUJ0cMtQMKylpQk9AjFxy87qJ1PjOGw0UJWuGuSizRd6JvdmYBvc9R0mzAj1kpKImaSez4nqcfr25DAmGTP
            s/ZCYHSFdQc+/QeI1bP0x3p3S9k+rZCXvCIGA8v2Jn94JG9MAlyvBjA9u0OP0kA9CKjXxl6Ud7RMzBSQXVcfwRvS
            L2vJabQGd0LjNL5wNP9kfEpXyv/7hI0mwmT6I4JQCi6xX3IkzgAy3tg8ZgWIsBIDtrgcViYaHSSFGjkoEGIcSO1
            VF90gKAWXsmZxYpEUycSB8BKeLeY55OQfLBxK+VJhCMKw30SRPF4HoBO5xNxIenpin1SRiea/p39w+eifPw7/b/9
            eKLL3SPInsbBwKO08/+4jWYIYuBJ2oRYSejcsZBprpMaU88WaxogG5jqnIe6RCHHDwyC0hnUasBdZlax7ZvK/R6T
            UYazFSkXZngsOylrdAjPQEnoo1M/BPv4Ii2KGdFkG9xHNWpmVASkBolBclS02CIekZ8kUPv5peDqKcE/zXI7o9tN
            FGn6aqxAvvBHi03gpwRLrxI7O0rdFw91g6aCdGtjxn+/F8tq+IOtO8lWVYfIaxX9+7fZMGpM8WDiUa1AU4bxANW
            TqGneAhY1mZqyZXcqSdRf385C+suOLoMVpst6vVgo5yZreCOWUKWntRir19673+en/kq9Xc+792xo8l0EN/ZvGfE
            S7NfloFfopa65uYbDov6TQwSz3/1yn3pnF7pOR8L/8JzKs7LOMQH9e1pkXk0mKedo5alkPL2qZwKcWRb272HSCuu
            b++iCOGmo3bxFeM3vVzmr/7UDrB865kazzFh9leooQLL448OQ+Mpe0vPoosmHVOBfC5MsxNrPt2PFiltK9lKDNT6
            6Iu7YMM48Vu3kdXyfF79A+BJAdDrpvxAC8RaEpf1Z6rtmFWK09vD9k+OPwpqUqLRl2r/TjFawyWdniJ5KVysCgy6
            9YAaJqLO0jspf+Y+8foB7L4hV0C3A1moQoQlewk8HALNDHJ3H2jYIPurtA7M5UYJRHCm+Gh2yHtXKY4G7qYWgLPb
            7aw9BcwT7K1FruFkdo8AfzqjdNAavudWzZzsrV0qAiBNVdCrZAMkmufLj+Yp9M
        """

        const val InvalidGraphBase64 = """
            SEVSSVRHMDAAAWJwbGlzdDAw1QECAwQFBgcIEjJdc2NoZW1hVmVyc2lvblpleHBvcnRlZEF0VHRyZWVWcGVvcGxl
            XXJlbGF0aW9uc2hpcHMQATNBxYIUQAAAANUJCgsMDQ4PEAcRUmlkVXRpdGxlWWNyZWF0ZWRBdFl1cGRhdGVkQXRf
            EBRsYXN0U2VsZWN0ZWRQZXJzb25JRF50cmVlLXN5bnRoZXRpY18QF0xlZ2FjeSBTeW50aGV0aWMgRmFtaWx5M0HC
            hyPAAAAAXHBlcnNvbi1hbHBoYaITLN4JFBUWCxcYGRobHB0eHxEOICEiIyQlJicoKSorVnRyZWVJRFtkaXNwbGF5
            TmFtZVlnZW5kZXJSYXdZYmlydGhEYXRlXxAVYmlydGhEYXRlUHJlY2lzaW9uUmF3VW5vdGVzW2FkZHJlc3NMaW5l
            VGNpdHlYcHJvdmluY2VXY291bnRyeVpwb3N0YWxDb2RlXxAQcHJvZmlsZVBob3RvRGF0YWoAQQB5AHUAIADJAGwA
            bwBkAGkAZVZmZW1hbGUzQcKHI/IAAAAzwb15oUAAAABVZXhhY3RfEBRTeW50aGV0aWMgbm90ZXMgb25seVBXQmFu
            ZHVuZ1lXZXN0IEphdmFZSW5kb25lc2lhVTQwMTIzS4lQTkcNChoKAQID3AkUFRYLGBkaGxwdHi0OLi8wMSYmJiYm
            JltwZXJzb24tYmV0YVRCaW1hVG1hbGUzQcKHJCQAAABUeWVhcqEz2AkUNDU2Nws4OQ4ROjs8PT5cZnJvbVBlcnNv
            bklEWnRvUGVyc29uSURXa2luZFJhd1pzdWJ0eXBlUmF3XG1hcnJpYWdlRGF0ZV8QF3JlbGF0aW9uc2hpcC1hbHBo
            YS1iZXRhXnBlcnNvbi1taXNzaW5nV3BhcnRuZXJWc3BvdXNlM0HEBJwAAAAAM0GxzuMAAAAAAAgAEwAhACwAMQA4
            AEYASABRAFwAXwBlAG8AeQCQAJ8AuQDCAM8A0gDvAPYBAgEMARYBLgE0AUABRQFOAVYBYQF0AYkBkAGZAaIBqAG/
            AcAByAHSAdwB4gHuAgcCEwIYAh0CJgIrAi0CPgJLAlYCXgJpAnYCkAKfAqcCrgK3AAAAAAAAAgEAAAAAAAAAPwAA
            AAAAAAAAAAAAAAAAAsA=
        """
    }
}
