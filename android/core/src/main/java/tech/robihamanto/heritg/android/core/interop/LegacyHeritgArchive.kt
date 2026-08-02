package tech.robihamanto.heritg.android.core.interop

import tech.robihamanto.heritg.android.core.model.BirthDatePrecision
import tech.robihamanto.heritg.android.core.model.FamilyRelationship
import tech.robihamanto.heritg.android.core.model.FamilyTree
import tech.robihamanto.heritg.android.core.model.Person
import tech.robihamanto.heritg.android.core.model.PersonGender
import tech.robihamanto.heritg.android.core.model.RelationshipKind
import tech.robihamanto.heritg.android.core.model.RelationshipSubtype
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.GeneralSecurityException
import java.time.Instant
import kotlin.math.floor
import kotlin.math.roundToLong
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

internal object LegacyHeritgArchive {
    private val RootKeys = setOf("schemaVersion", "exportedAt", "tree", "people", "relationships")
    private val TreeKeys = setOf("id", "title", "createdAt", "updatedAt", "lastSelectedPersonID")
    private val PersonKeys = setOf(
        "id", "treeID", "displayName", "genderRaw", "createdAt", "birthDate", "deathDate",
        "birthDatePrecisionRaw", "notes", "addressLine", "city", "province", "country", "postalCode",
        "profilePhotoData",
    )
    private val RelationshipKeys = setOf(
        "id", "treeID", "fromPersonID", "toPersonID", "kindRaw", "subtypeRaw", "createdAt", "marriageDate",
    )

    fun matches(archive: ByteArray): Boolean = archive.startsWith(ArchiveConstants.LegacyUnencryptedMagic) ||
        archive.startsWith(ArchiveConstants.LegacyEncryptedMagic)

    fun decode(archive: ByteArray, password: String): ArchivePayload {
        if (archive.size > ArchiveConstants.MaximumArchiveBytes) throw ArchiveException.FileTooLarge()
        val plist = when {
            archive.startsWith(ArchiveConstants.LegacyUnencryptedMagic) -> decodeUnencryptedEnvelope(archive)
            archive.startsWith(ArchiveConstants.LegacyEncryptedMagic) -> decryptEnvelope(archive, password)
            else -> throw ArchiveException.InvalidArchive()
        }
        return decodePayload(plist).also(ArchiveValidation::validate)
    }

    private fun decodeUnencryptedEnvelope(archive: ByteArray): ByteArray {
        val payloadStart = ArchiveConstants.LegacyUnencryptedMagic.size + 2
        if (archive.size <= payloadStart) throw ArchiveException.InvalidArchive()
        requireVersion(archive)
        return archive.copyOfRange(payloadStart, archive.size)
    }

    private fun decryptEnvelope(archive: ByteArray, password: String): ByteArray {
        if (archive.size < ArchiveConstants.LegacyHeaderBytes + ArchiveConstants.TagBytes) {
            throw ArchiveException.InvalidArchive()
        }
        requireVersion(archive)
        val buffer = ByteBuffer.wrap(archive).order(ByteOrder.BIG_ENDIAN)
        buffer.position(ArchiveConstants.LegacyEncryptedMagic.size + 2)
        val rounds = buffer.int
        if (rounds !in ArchiveConstants.MinimumPbkdf2Iterations..ArchiveConstants.MaximumPbkdf2Iterations) {
            throw ArchiveException.InvalidArchive()
        }
        val salt = ByteArray(ArchiveConstants.SaltBytes).also(buffer::get)
        val nonce = ByteArray(ArchiveConstants.NonceBytes).also(buffer::get)
        val header = archive.copyOfRange(0, ArchiveConstants.LegacyHeaderBytes)
        val sealed = archive.copyOfRange(ArchiveConstants.LegacyHeaderBytes, archive.size)
        val passwordBytes = password.encodeToByteArray()
        val key = try {
            ArchiveCrypto.pbkdf2(passwordBytes, salt, rounds)
        } catch (error: GeneralSecurityException) {
            passwordBytes.fill(0)
            throw ArchiveException.InvalidArchive(error)
        }
        return try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(
                Cipher.DECRYPT_MODE,
                SecretKeySpec(key, "AES"),
                GCMParameterSpec(ArchiveConstants.TagBytes * 8, nonce),
            )
            cipher.updateAAD(header)
            cipher.doFinal(sealed)
        } catch (error: GeneralSecurityException) {
            throw ArchiveException.WrongPasswordOrCorrupt(error)
        } finally {
            passwordBytes.fill(0)
            key.fill(0)
        }
    }

    private fun requireVersion(archive: ByteArray) {
        if (archive.size < 10) throw ArchiveException.InvalidArchive()
        val version = ((archive[8].toInt() and 0xff) shl 8) or (archive[9].toInt() and 0xff)
        if (version != ArchiveConstants.EnvelopeVersion) throw ArchiveException.UnsupportedVersion()
    }

    private fun decodePayload(bytes: ByteArray): ArchivePayload {
        val plist = LegacyBinaryPlist(bytes)
        val root = plist.dictionary(plist.rootReference, RootKeys).requiring(RootKeys)
        val schemaValue = plist.integer(root.getValue("schemaVersion"))
        if (schemaValue != ArchiveConstants.SchemaVersion.toLong()) throw ArchiveException.UnsupportedVersion()
        val schemaVersion = schemaValue.toInt()
        val tree = decodeTree(plist, root.getValue("tree"))
        val people = ArrayList<Person>()
        val personIds = mutableSetOf<String>()
        var photoBytes = 0L
        plist.array(root.getValue("people"), ArchiveConstants.MaximumPeople).forEach { reference ->
            val person = decodePerson(plist, reference)
            if (!personIds.add(person.id)) throw ArchiveException.InvalidArchive()
            photoBytes += person.profilePhotoData?.size ?: 0
            if (photoBytes > ArchiveConstants.MaximumArchiveBytes) throw ArchiveException.FileTooLarge()
            people += person
        }
        val relationships = ArrayList<FamilyRelationship>()
        val relationshipIds = mutableSetOf<String>()
        plist.array(
            root.getValue("relationships"),
            ArchiveConstants.MaximumRelationships,
        ).forEach { reference ->
            val relationship = decodeRelationship(plist, reference)
            if (!relationshipIds.add(relationship.id)) throw ArchiveException.InvalidArchive()
            relationships += relationship
        }
        return ArchivePayload(
            exportedAt = cocoaDate(plist.date(root.getValue("exportedAt"))),
            tree = tree,
            people = people,
            relationships = relationships,
            schemaVersion = schemaVersion,
        )
    }

    private fun decodeTree(plist: LegacyBinaryPlist, reference: Int): FamilyTree {
        val values = plist.dictionary(reference, TreeKeys).requiring(TreeKeys - "lastSelectedPersonID")
        return FamilyTree(
            id = plist.shortString(values, "id"),
            title = plist.shortString(values, "title"),
            createdAt = plist.dateValue(values, "createdAt"),
            updatedAt = plist.dateValue(values, "updatedAt"),
            lastSelectedPersonId = values["lastSelectedPersonID"]?.let {
                plist.string(it, ArchiveConstants.MaximumShortFieldBytes)
            },
        )
    }

    private fun decodePerson(plist: LegacyBinaryPlist, reference: Int): Person {
        val optional = setOf("birthDate", "deathDate", "profilePhotoData")
        val values = plist.dictionary(reference, PersonKeys).requiring(PersonKeys - optional)
        return Person(
            id = plist.shortString(values, "id"),
            treeId = plist.shortString(values, "treeID"),
            displayName = plist.shortString(values, "displayName"),
            gender = PersonGender.fromWire(plist.shortString(values, "genderRaw"))
                ?: throw ArchiveException.InvalidArchive(),
            createdAt = plist.dateValue(values, "createdAt"),
            birthDate = values["birthDate"]?.let(plist::date)?.let(::cocoaDate),
            deathDate = values["deathDate"]?.let(plist::date)?.let(::cocoaDate),
            birthDatePrecision = BirthDatePrecision.fromWire(plist.shortString(values, "birthDatePrecisionRaw"))
                ?: throw ArchiveException.InvalidArchive(),
            notes = plist.string(values.getValue("notes"), ArchiveConstants.MaximumNotesBytes),
            addressLine = plist.shortString(values, "addressLine"),
            city = plist.shortString(values, "city"),
            province = plist.shortString(values, "province"),
            country = plist.shortString(values, "country"),
            postalCode = plist.shortString(values, "postalCode"),
            profilePhotoData = values["profilePhotoData"]?.let {
                plist.data(it, ArchiveConstants.MaximumMediaBytes)
            },
        )
    }

    private fun decodeRelationship(plist: LegacyBinaryPlist, reference: Int): FamilyRelationship {
        val values = plist.dictionary(reference, RelationshipKeys).requiring(RelationshipKeys - "marriageDate")
        val kind = RelationshipKind.fromWire(plist.shortString(values, "kindRaw"))
            ?: throw ArchiveException.InvalidArchive()
        return FamilyRelationship(
            id = plist.shortString(values, "id"),
            treeId = plist.shortString(values, "treeID"),
            fromPersonId = plist.shortString(values, "fromPersonID"),
            toPersonId = plist.shortString(values, "toPersonID"),
            kind = kind,
            subtype = RelationshipSubtype.fromWire(plist.shortString(values, "subtypeRaw"))
                ?: throw ArchiveException.InvalidArchive(),
            createdAt = plist.dateValue(values, "createdAt"),
            marriageDate = values["marriageDate"]?.let(plist::date)?.let(::cocoaDate),
        )
    }

    private fun LegacyBinaryPlist.shortString(values: Map<String, Int>, key: String): String =
        string(values.getValue(key), ArchiveConstants.MaximumShortFieldBytes)

    private fun LegacyBinaryPlist.dateValue(values: Map<String, Int>, key: String): Instant =
        cocoaDate(date(values.getValue(key)))

    private fun Map<String, Int>.requiring(required: Set<String>): Map<String, Int> = apply {
        if (!keys.containsAll(required)) throw ArchiveException.InvalidArchive()
    }

    private fun cocoaDate(seconds: Double): Instant = try {
        val unixSeconds = seconds + CocoaEpochOffset
        val wholeSeconds = floor(unixSeconds)
        var nanos = ((unixSeconds - wholeSeconds) * 1_000_000_000).roundToLong()
        var epochSeconds = wholeSeconds.toLong()
        if (nanos == 1_000_000_000L) {
            epochSeconds++
            nanos = 0
        }
        Instant.ofEpochSecond(epochSeconds, nanos)
    } catch (error: Exception) {
        throw ArchiveException.InvalidArchive(error)
    }

    private fun ByteArray.startsWith(prefix: ByteArray): Boolean =
        size >= prefix.size && prefix.indices.all { this[it] == prefix[it] }

    private const val CocoaEpochOffset = 978_307_200.0
}
