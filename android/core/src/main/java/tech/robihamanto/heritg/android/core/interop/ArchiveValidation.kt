package tech.robihamanto.heritg.android.core.interop

import tech.robihamanto.heritg.android.core.domain.FamilyGraph
import tech.robihamanto.heritg.android.core.model.BirthDatePrecision
import tech.robihamanto.heritg.android.core.model.PersonGender
import tech.robihamanto.heritg.android.core.model.RelationshipKind
import tech.robihamanto.heritg.android.core.model.RelationshipSubtype

internal object ArchiveValidation {
    fun validate(payload: ArchivePayload) {
        if (payload.schemaVersion != ArchiveConstants.SchemaVersion) throw ArchiveException.UnsupportedVersion()
        if (payload.people.size > ArchiveConstants.MaximumPeople ||
            payload.relationships.size > ArchiveConstants.MaximumRelationships
        ) throw ArchiveException.TooManyRecords()
        validateShort(payload.tree.id, false)
        validateShort(payload.tree.title, false)
        var photoBytes = 0L
        payload.people.forEach { person ->
            validateShort(person.id, false)
            validateShort(person.treeId, false)
            validateShort(person.displayName, false)
            listOf(person.addressLine, person.city, person.province, person.country, person.postalCode)
                .forEach(::validateShort)
            if (person.notes.encodeToByteArray().size > ArchiveConstants.MaximumNotesBytes) {
                throw ArchiveException.FieldTooLarge()
            }
            person.profilePhotoData?.let {
                if (it.size > ArchiveConstants.MaximumMediaBytes) throw ArchiveException.MediaTooLarge()
                photoBytes += it.size
                if (photoBytes > ArchiveConstants.MaximumArchiveBytes) throw ArchiveException.FileTooLarge()
            }
        }
        payload.relationships.forEach {
            validateShort(it.id, false)
            validateShort(it.treeId, false)
            validateShort(it.fromPersonId, false)
            validateShort(it.toPersonId, false)
        }
        try {
            FamilyGraph.validate(payload.tree, payload.people, payload.relationships)
        } catch (error: IllegalArgumentException) {
            throw ArchiveException.InvalidArchive(error)
        }
    }

    fun validateRecords(
        manifest: ArchiveManifest,
        tree: TreeRecord,
        people: List<PersonRecord>,
        relationships: List<RelationshipRecord>,
        media: Map<String, ByteArray>,
    ) {
        if (manifest.format != ArchiveConstants.Format || manifest.hashAlgorithm != ArchiveConstants.HashAlgorithm) {
            throw ArchiveException.InvalidArchive()
        }
        if (manifest.formatVersion != ArchiveConstants.FormatVersion ||
            manifest.schemaVersion != ArchiveConstants.SchemaVersion
        ) throw ArchiveException.UnsupportedVersion()
        if (tree.schemaVersion != ArchiveConstants.SchemaVersion) throw ArchiveException.InvalidArchive()
        if (manifest.treeId != tree.id || manifest.counts.people != people.size ||
            manifest.counts.relationships != relationships.size || manifest.counts.media != media.size
        ) throw ArchiveException.InvalidArchive()
        if (people.size > ArchiveConstants.MaximumPeople ||
            relationships.size > ArchiveConstants.MaximumRelationships ||
            media.size > ArchiveConstants.MaximumMediaFiles
        ) throw ArchiveException.TooManyRecords()
        validateShort(tree.id, false)
        validateShort(tree.title, false)
        ArchiveDates.parseInstant(manifest.createdAt)
        ArchiveDates.parseInstant(tree.createdAt)
        ArchiveDates.parseInstant(tree.updatedAt)

        val personIds = people.map { it.id }
        if (personIds.toSet().size != personIds.size ||
            tree.lastSelectedPersonId != null && tree.lastSelectedPersonId !in personIds
        ) throw ArchiveException.InvalidArchive()
        val referencedMedia = mutableSetOf<String>()
        people.forEach { person ->
            if (person.schemaVersion != ArchiveConstants.SchemaVersion) throw ArchiveException.UnsupportedVersion()
            if (person.treeId != tree.id || PersonGender.fromWire(person.gender) == null ||
                BirthDatePrecision.fromWire(person.birthDatePrecision) == null
            ) throw ArchiveException.InvalidArchive()
            validateShort(person.id, false)
            validateShort(person.treeId, false)
            validateShort(person.displayName, false)
            listOf(person.addressLine, person.city, person.province, person.country, person.postalCode)
                .forEach(::validateShort)
            if (person.notes.encodeToByteArray().size > ArchiveConstants.MaximumNotesBytes) {
                throw ArchiveException.FieldTooLarge()
            }
            ArchiveDates.parseInstant(person.createdAt)
            val birth = ArchiveDates.parseCalendarDate(person.birthDate)
            val death = ArchiveDates.parseCalendarDate(person.deathDate)
            if (birth != null && death != null && death < birth) throw ArchiveException.InvalidArchive()
            person.profilePhoto?.let { reference ->
                val bytes = media[reference.path] ?: throw ArchiveException.InvalidArchive()
                if (bytes.size != reference.byteSize || bytes.size > ArchiveConstants.MaximumMediaBytes) {
                    throw ArchiveException.InvalidArchive()
                }
                val actual = mediaInfo(bytes).reference
                if (reference != actual) throw ArchiveException.InvalidArchive()
                referencedMedia += reference.path
            }
        }
        if (referencedMedia != media.keys) throw ArchiveException.InvalidArchive()

        val ids = mutableSetOf<String>()
        val signatures = mutableSetOf<String>()
        relationships.forEach { relationship ->
            if (relationship.schemaVersion != ArchiveConstants.SchemaVersion) throw ArchiveException.UnsupportedVersion()
            val kind = RelationshipKind.fromWire(relationship.kind) ?: throw ArchiveException.InvalidArchive()
            val subtype = RelationshipSubtype.fromWire(relationship.subtype) ?: throw ArchiveException.InvalidArchive()
            if (!subtype.isValidFor(kind) || !ids.add(relationship.id) || relationship.treeId != tree.id ||
                relationship.fromPersonId == relationship.toPersonId ||
                relationship.fromPersonId !in personIds || relationship.toPersonId !in personIds
            ) throw ArchiveException.InvalidArchive()
            listOf(relationship.id, relationship.treeId, relationship.fromPersonId, relationship.toPersonId)
                .forEach { validateShort(it, false) }
            ArchiveDates.parseInstant(relationship.createdAt)
            ArchiveDates.parseCalendarDate(relationship.marriageDate)
            val endpoints = if (kind == RelationshipKind.PARENT) {
                listOf(relationship.fromPersonId, relationship.toPersonId)
            } else listOf(relationship.fromPersonId, relationship.toPersonId).sorted()
            if (!signatures.add("${kind.wireName}|${endpoints[0]}|${endpoints[1]}")) {
                throw ArchiveException.InvalidArchive()
            }
        }
    }

    private fun validateShort(value: String, allowsEmpty: Boolean = true) {
        if (value.encodeToByteArray().size > ArchiveConstants.MaximumShortFieldBytes) {
            throw ArchiveException.FieldTooLarge()
        }
        if (!allowsEmpty && value.isBlank()) throw ArchiveException.InvalidArchive()
    }
}
