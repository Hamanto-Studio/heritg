package tech.robihamanto.heritg.android.core.interop

import kotlinx.serialization.Serializable
import tech.robihamanto.heritg.android.core.model.FamilyRelationship
import tech.robihamanto.heritg.android.core.model.FamilyTree
import tech.robihamanto.heritg.android.core.model.Person
import java.time.Instant

object ArchiveConstants {
    const val Format = "heritg-family-archive"
    const val FormatVersion = "1.0.0"
    const val SchemaVersion = 1
    const val ManifestPath = "manifest.json"
    const val TreePath = "tree.json"
    const val PeoplePath = "people.jsonl"
    const val RelationshipsPath = "relationships.jsonl"
    const val ChecksumsPath = "checksums.sha256"
    const val MediaPrefix = "media/"
    const val HashAlgorithm = "sha256"

    val EncryptedMagic = "HTGENC01".encodeToByteArray()
    val LegacyUnencryptedMagic = "HERITG00".encodeToByteArray()
    val LegacyEncryptedMagic = "HERITG01".encodeToByteArray()
    val ZipMagic = byteArrayOf(0x50, 0x4b, 0x03, 0x04)
    const val EnvelopeVersion = 1
    const val KdfIdPbkdf2HmacSha256 = 1
    const val CipherIdAes256Gcm = 1
    const val Pbkdf2Iterations = 600_000
    const val KeyBytes = 32
    const val SaltBytes = 16
    const val NonceBytes = 12
    const val TagBytes = 16
    const val HeaderBytes = 8 + 2 + 1 + 1 + 4 + SaltBytes + NonceBytes
    const val LegacyHeaderBytes = 8 + 2 + 4 + SaltBytes + NonceBytes
    const val MinimumPbkdf2Iterations = 100_000
    const val MaximumPbkdf2Iterations = 2_000_000

    const val MaximumArchiveBytes = 32 * 1024 * 1024
    const val MaximumPeople = 100_000
    const val MaximumRelationships = 300_000
    const val MaximumMediaFiles = 50_000
    const val MaximumShortFieldBytes = 4_096
    const val MaximumNotesBytes = 1024 * 1024
    const val MaximumMediaBytes = 10 * 1024 * 1024
}

data class ArchivePayload(
    val exportedAt: Instant,
    val tree: FamilyTree,
    val people: List<Person>,
    val relationships: List<FamilyRelationship>,
    val schemaVersion: Int = ArchiveConstants.SchemaVersion,
)

// Properties are declared in lexical order to match JSONEncoder.sortedKeys.
@Serializable
data class ArchiveManifest(
    val counts: ArchiveCounts,
    val createdAt: String,
    val format: String,
    val formatVersion: String,
    val hashAlgorithm: String,
    val schemaVersion: Int,
    val treeId: String,
)

@Serializable
data class ArchiveCounts(val media: Int, val people: Int, val relationships: Int)

@Serializable
data class TreeRecord(
    val createdAt: String,
    val id: String,
    val lastSelectedPersonId: String? = null,
    val schemaVersion: Int,
    val title: String,
    val updatedAt: String,
)

@Serializable
data class MediaReference(
    val byteSize: Int,
    val mimeType: String,
    val path: String,
    val sha256: String,
)

@Serializable
data class PersonRecord(
    val addressLine: String,
    val birthDate: String? = null,
    val birthDatePrecision: String,
    val city: String,
    val country: String,
    val createdAt: String,
    val deathDate: String? = null,
    val displayName: String,
    val gender: String,
    val id: String,
    val notes: String,
    val postalCode: String,
    val profilePhoto: MediaReference? = null,
    val province: String,
    val schemaVersion: Int,
    val treeId: String,
)

@Serializable
data class RelationshipRecord(
    val createdAt: String,
    val fromPersonId: String,
    val id: String,
    val kind: String,
    val marriageDate: String? = null,
    val schemaVersion: Int,
    val subtype: String,
    val toPersonId: String,
    val treeId: String,
)

data class MediaValue(val reference: MediaReference, val bytes: ByteArray)

enum class ArchiveProtection { UNENCRYPTED, ENCRYPTED }

sealed class ArchiveException(message: String, cause: Throwable? = null) : Exception(message, cause) {
    class FileTooLarge : ArchiveException("Archive exceeds the size limit")
    class InvalidArchive(cause: Throwable? = null) : ArchiveException("Archive is invalid", cause)
    class UnsupportedVersion : ArchiveException("Archive version is unsupported")
    class WrongPasswordOrCorrupt(cause: Throwable? = null) : ArchiveException("Wrong password or corrupt archive", cause)
    class TooManyRecords : ArchiveException("Archive has too many records")
    class FieldTooLarge : ArchiveException("Archive contains an oversized field")
    class MediaTooLarge : ArchiveException("Archive contains oversized media")
    class IdentifierCollision : ArchiveException("Archive identifiers already exist")
}
