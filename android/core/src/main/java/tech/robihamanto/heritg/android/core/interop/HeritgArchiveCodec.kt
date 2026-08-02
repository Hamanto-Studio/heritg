package tech.robihamanto.heritg.android.core.interop

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import tech.robihamanto.heritg.android.core.model.BirthDatePrecision
import tech.robihamanto.heritg.android.core.model.FamilyRelationship
import tech.robihamanto.heritg.android.core.model.FamilyTree
import tech.robihamanto.heritg.android.core.model.Person
import tech.robihamanto.heritg.android.core.model.PersonGender
import tech.robihamanto.heritg.android.core.model.RelationshipKind
import tech.robihamanto.heritg.android.core.model.RelationshipSubtype
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.nio.charset.StandardCharsets

class HeritgArchiveCodec {
    private val json = Json {
        encodeDefaults = true
        explicitNulls = false
        ignoreUnknownKeys = true
    }

    fun protection(archive: ByteArray): ArchiveProtection = ArchiveCrypto.protection(archive)

    fun encode(payload: ArchivePayload, password: String? = null): ByteArray {
        val zip = encodeZip(payload)
        val archive = if (password.isNullOrEmpty()) zip else ArchiveCrypto.encrypt(zip, password)
        if (archive.size > ArchiveConstants.MaximumArchiveBytes) throw ArchiveException.FileTooLarge()
        return archive
    }

    internal fun encode(
        payload: ArchivePayload,
        password: String,
        salt: ByteArray,
        nonce: ByteArray,
    ): ByteArray {
        val zip = encodeZip(payload)
        return if (password.isEmpty()) zip else ArchiveCrypto.encrypt(zip, password, salt, nonce)
    }

    fun decode(archive: ByteArray, password: String? = null): ArchivePayload = try {
        val protection = ArchiveCrypto.protection(archive)
        if (LegacyHeritgArchive.matches(archive)) {
            LegacyHeritgArchive.decode(archive, password.orEmpty())
        } else {
            val zip = when (protection) {
                ArchiveProtection.UNENCRYPTED -> archive
                ArchiveProtection.ENCRYPTED -> ArchiveCrypto.decrypt(archive, password.orEmpty())
            }
            decodeZip(zip)
        }
    } catch (error: ArchiveException) {
        throw error
    } catch (error: Exception) {
        throw ArchiveException.InvalidArchive(error)
    }

    internal fun exploded(payload: ArchivePayload): Map<String, ByteArray> =
        HeritgZip.decode(encodeZip(payload))

    private fun encodeZip(payload: ArchivePayload): ByteArray {
        ArchiveValidation.validate(payload)
        val mediaByHash = linkedMapOf<String, MediaValue>()
        val people = payload.people.map { person ->
            val photo = person.profilePhotoData?.let { bytes ->
                val info = mediaInfo(bytes)
                val existing = mediaByHash[info.reference.sha256]
                if (existing != null && !existing.bytes.contentEquals(bytes)) throw ArchiveException.InvalidArchive()
                mediaByHash[info.reference.sha256] = info
                info.reference
            }
            PersonRecord(
                addressLine = person.addressLine,
                birthDate = ArchiveDates.calendarDate(person.birthDate),
                birthDatePrecision = person.birthDatePrecision.wireName,
                city = person.city,
                country = person.country,
                createdAt = ArchiveDates.instant(person.createdAt),
                deathDate = ArchiveDates.calendarDate(person.deathDate),
                displayName = person.displayName,
                gender = person.gender.wireName,
                id = person.id,
                notes = person.notes,
                postalCode = person.postalCode,
                profilePhoto = photo,
                province = person.province,
                schemaVersion = ArchiveConstants.SchemaVersion,
                treeId = person.treeId,
            )
        }
        if (mediaByHash.size > ArchiveConstants.MaximumMediaFiles) throw ArchiveException.TooManyRecords()
        val relationships = payload.relationships.map {
            RelationshipRecord(
                createdAt = ArchiveDates.instant(it.createdAt),
                fromPersonId = it.fromPersonId,
                id = it.id,
                kind = it.kind.wireName,
                marriageDate = ArchiveDates.calendarDate(it.marriageDate),
                schemaVersion = ArchiveConstants.SchemaVersion,
                subtype = it.subtype.wireName,
                toPersonId = it.toPersonId,
                treeId = it.treeId,
            )
        }
        val manifest = ArchiveManifest(
            counts = ArchiveCounts(mediaByHash.size, people.size, relationships.size),
            createdAt = ArchiveDates.instant(payload.exportedAt),
            format = ArchiveConstants.Format,
            formatVersion = ArchiveConstants.FormatVersion,
            hashAlgorithm = ArchiveConstants.HashAlgorithm,
            schemaVersion = ArchiveConstants.SchemaVersion,
            treeId = payload.tree.id,
        )
        val tree = TreeRecord(
            createdAt = ArchiveDates.instant(payload.tree.createdAt),
            id = payload.tree.id,
            lastSelectedPersonId = payload.tree.lastSelectedPersonId,
            schemaVersion = ArchiveConstants.SchemaVersion,
            title = payload.tree.title,
            updatedAt = ArchiveDates.instant(payload.tree.updatedAt),
        )
        val files = linkedMapOf(
            ArchiveConstants.ManifestPath to encodeJson(manifest),
            ArchiveConstants.TreePath to encodeJson(tree),
            ArchiveConstants.PeoplePath to people.toJsonLines(),
            ArchiveConstants.RelationshipsPath to relationships.toJsonLines(),
        )
        mediaByHash.values.forEach { files[it.reference.path] = it.bytes }
        files[ArchiveConstants.ChecksumsPath] = checksumFile(files)
        return HeritgZip.encode(files)
    }

    private inline fun <reified T> encodeJson(value: T): ByteArray =
        json.encodeToString(value).encodeToByteArray().also {
            if (it.size > ArchiveConstants.MaximumArchiveBytes) throw ArchiveException.FileTooLarge()
        }

    private inline fun <reified T> List<T>.toJsonLines(): ByteArray {
        if (isEmpty()) return byteArrayOf()
        return joinToString(separator = "\n", postfix = "\n") { json.encodeToString(it) }
            .encodeToByteArray().also {
                if (it.size > ArchiveConstants.MaximumArchiveBytes) throw ArchiveException.FileTooLarge()
            }
    }

    private fun checksumFile(files: Map<String, ByteArray>): ByteArray = files.keys.sorted().joinToString("") {
        "${sha256(files.getValue(it))}  $it\n"
    }.encodeToByteArray()

    private fun decodeZip(zip: ByteArray): ArchivePayload {
        val files = HeritgZip.decode(zip)
        if (files.size > ArchiveConstants.MaximumMediaFiles + 5) throw ArchiveException.TooManyRecords()
        val checksumData = files[ArchiveConstants.ChecksumsPath] ?: throw ArchiveException.InvalidArchive()
        verifyChecksums(checksumData, files)
        val required = setOf(
            ArchiveConstants.ManifestPath,
            ArchiveConstants.TreePath,
            ArchiveConstants.PeoplePath,
            ArchiveConstants.RelationshipsPath,
            ArchiveConstants.ChecksumsPath,
        )
        val mediaPaths = files.keys.filterTo(mutableSetOf()) { it.startsWith(ArchiveConstants.MediaPrefix) }
        if (files.keys != required + mediaPaths || mediaPaths.size > ArchiveConstants.MaximumMediaFiles ||
            mediaPaths.any { !it.matches(MediaPathRegex) }
        ) throw ArchiveException.InvalidArchive()
        try {
            val manifest = decodeJson<ArchiveManifest>(files.getValue(ArchiveConstants.ManifestPath))
            val tree = decodeJson<TreeRecord>(files.getValue(ArchiveConstants.TreePath))
            val people = decodeLines<PersonRecord>(files.getValue(ArchiveConstants.PeoplePath), ArchiveConstants.MaximumPeople)
            val relationships = decodeLines<RelationshipRecord>(
                files.getValue(ArchiveConstants.RelationshipsPath),
                ArchiveConstants.MaximumRelationships,
            )
            val media = mediaPaths.associateWith(files::getValue)
            ArchiveValidation.validateRecords(manifest, tree, people, relationships, media)
            return recordsToPayload(manifest, tree, people, relationships, media).also(ArchiveValidation::validate)
        } catch (error: ArchiveException) {
            throw error
        } catch (error: Exception) {
            throw ArchiveException.InvalidArchive(error)
        }
    }

    private fun verifyChecksums(checksumData: ByteArray, files: Map<String, ByteArray>) {
        if (checksumData.isEmpty() || checksumData.last() != '\n'.code.toByte() || '\r'.code.toByte() in checksumData) {
            throw ArchiveException.InvalidArchive()
        }
        val contents = checksumData.strictUtf8()
        val lines = contents.split('\n')
        if (lines.last().isNotEmpty()) throw ArchiveException.InvalidArchive()
        val listed = mutableSetOf<String>()
        lines.dropLast(1).forEach { line ->
            val bytes = line.encodeToByteArray()
            if (bytes.size <= 66 || bytes[64] != 0x20.toByte() || bytes[65] != 0x20.toByte() ||
                bytes.copyOfRange(0, 64).any { it !in '0'.code.toByte()..'9'.code.toByte() && it !in 'a'.code.toByte()..'f'.code.toByte() }
            ) throw ArchiveException.InvalidArchive()
            val path = bytes.copyOfRange(66, bytes.size).strictUtf8()
            HeritgZip.validatePath(path)
            val data = files[path]
            if (path == ArchiveConstants.ChecksumsPath || data == null || !listed.add(path) ||
                bytes.copyOfRange(0, 64).decodeToString() != sha256(data)
            ) throw ArchiveException.InvalidArchive()
        }
        if (listed != files.keys - ArchiveConstants.ChecksumsPath) throw ArchiveException.InvalidArchive()
    }

    private inline fun <reified T> decodeJson(bytes: ByteArray): T =
        json.decodeFromString(bytes.strictUtf8())

    private inline fun <reified T> decodeLines(bytes: ByteArray, maximum: Int): List<T> {
        if (bytes.isEmpty()) return emptyList()
        if (bytes.last() != '\n'.code.toByte() || '\r'.code.toByte() in bytes) {
            throw ArchiveException.InvalidArchive()
        }
        val lines = bytes.strictUtf8().split('\n')
        if (lines.last().isNotEmpty() || lines.size - 1 > maximum) throw ArchiveException.TooManyRecords()
        return lines.dropLast(1).map { line ->
            if (line.isEmpty() || line.encodeToByteArray().size >
                ArchiveConstants.MaximumNotesBytes + 10 * ArchiveConstants.MaximumShortFieldBytes
            ) throw ArchiveException.FieldTooLarge()
            json.decodeFromString<T>(line)
        }
    }

    private fun recordsToPayload(
        manifest: ArchiveManifest,
        tree: TreeRecord,
        people: List<PersonRecord>,
        relationships: List<RelationshipRecord>,
        media: Map<String, ByteArray>,
    ) = ArchivePayload(
        exportedAt = ArchiveDates.parseInstant(manifest.createdAt),
        tree = FamilyTree(
            tree.id,
            tree.title,
            ArchiveDates.parseInstant(tree.createdAt),
            ArchiveDates.parseInstant(tree.updatedAt),
            tree.lastSelectedPersonId,
        ),
        people = people.map {
            Person(
                id = it.id,
                treeId = it.treeId,
                displayName = it.displayName,
                gender = PersonGender.fromWire(it.gender) ?: throw ArchiveException.InvalidArchive(),
                createdAt = ArchiveDates.parseInstant(it.createdAt),
                birthDate = ArchiveDates.parseCalendarDate(it.birthDate),
                deathDate = ArchiveDates.parseCalendarDate(it.deathDate),
                birthDatePrecision = BirthDatePrecision.fromWire(it.birthDatePrecision)
                    ?: throw ArchiveException.InvalidArchive(),
                notes = it.notes,
                addressLine = it.addressLine,
                city = it.city,
                province = it.province,
                country = it.country,
                postalCode = it.postalCode,
                profilePhotoData = it.profilePhoto?.path?.let(media::get),
            )
        },
        relationships = relationships.map {
            FamilyRelationship(
                id = it.id,
                treeId = it.treeId,
                fromPersonId = it.fromPersonId,
                toPersonId = it.toPersonId,
                kind = RelationshipKind.fromWire(it.kind) ?: throw ArchiveException.InvalidArchive(),
                subtype = RelationshipSubtype.fromWire(it.subtype) ?: throw ArchiveException.InvalidArchive(),
                createdAt = ArchiveDates.parseInstant(it.createdAt),
                marriageDate = ArchiveDates.parseCalendarDate(it.marriageDate),
            )
        },
        schemaVersion = manifest.schemaVersion,
    )

    private fun ByteArray.strictUtf8(): String = try {
        StandardCharsets.UTF_8.newDecoder()
            .onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT)
            .decode(ByteBuffer.wrap(this)).toString()
    } catch (error: Exception) {
        throw ArchiveException.InvalidArchive(error)
    }

    private companion object {
        val MediaPathRegex = Regex("media/[0-9a-f]{64}\\.(png|jpg|gif|webp|heic|bin)")
    }
}
