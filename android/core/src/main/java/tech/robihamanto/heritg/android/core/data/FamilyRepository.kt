package tech.robihamanto.heritg.android.core.data

import androidx.room.withTransaction
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import tech.robihamanto.heritg.android.core.domain.FamilyGraph
import tech.robihamanto.heritg.android.core.domain.FamilyGraphException
import tech.robihamanto.heritg.android.core.domain.RelativeRole
import tech.robihamanto.heritg.android.core.domain.relationshipEndpoints
import tech.robihamanto.heritg.android.core.interop.ArchiveException
import tech.robihamanto.heritg.android.core.interop.ArchivePayload
import tech.robihamanto.heritg.android.core.model.FamilyRelationship
import tech.robihamanto.heritg.android.core.model.FamilyTree
import tech.robihamanto.heritg.android.core.model.Person
import tech.robihamanto.heritg.android.core.model.PersonDetails
import tech.robihamanto.heritg.android.core.model.PersonGender
import tech.robihamanto.heritg.android.core.model.RelationshipKind
import java.time.Instant

class FamilyRepository(private val database: HeritgDatabase) {
    private val dao = database.familyDao()

    fun observeTrees(): Flow<List<FamilyTree>> = dao.observeTrees().map { list -> list.map { it.toModel() } }
    fun observeTreeCount(): Flow<Int> = dao.observeTreeCount()

    suspend fun createTree(name: String): FamilyTree = database.withTransaction {
        FamilyTree(title = FamilyGraph.validatedName(name)).also { dao.insertTree(it.toEntity()) }
    }

    suspend fun renameTree(treeId: String, name: String) = database.withTransaction {
        val tree = dao.tree(treeId) ?: throw FamilyGraphException.InvalidGraph
        dao.updateTree(tree.copy(title = FamilyGraph.validatedName(name), updatedAtEpochMillis = Instant.now().toEpochMilli()))
    }

    suspend fun deleteTree(treeId: String) = database.withTransaction {
        dao.tree(treeId)?.let { dao.deleteTree(it) }
    }

    suspend fun createPerson(treeId: String, name: String): Person = database.withTransaction {
        val tree = dao.tree(treeId) ?: throw FamilyGraphException.InvalidGraph
        val person = Person(treeId = treeId, displayName = FamilyGraph.validatedName(name))
        dao.insertPeople(listOf(person.toEntity()))
        dao.updateTree(tree.copy(updatedAtEpochMillis = Instant.now().toEpochMilli()))
        person
    }

    suspend fun updatePerson(
        personId: String,
        name: String,
        gender: PersonGender,
        details: PersonDetails,
    ) = database.withTransaction {
        val current = dao.person(personId)?.toModel() ?: throw FamilyGraphException.InvalidGraph
        val normalized = FamilyGraph.normalizedDetails(details)
        dao.updatePerson(current.copy(
            displayName = FamilyGraph.validatedName(name),
            gender = gender,
            birthDate = normalized.birthDate,
            deathDate = normalized.deathDate,
            birthDatePrecision = normalized.birthDatePrecision,
            notes = normalized.notes,
            addressLine = normalized.addressLine,
            city = normalized.city,
            province = normalized.province,
            country = normalized.country,
            postalCode = normalized.postalCode,
            profilePhotoData = normalized.profilePhotoData,
        ).toEntity())
    }

    suspend fun link(personId: String, relativeId: String, role: RelativeRole): FamilyRelationship =
        database.withTransaction {
            val person = dao.person(personId)?.toModel() ?: throw FamilyGraphException.InvalidGraph
            val relative = dao.person(relativeId)?.toModel() ?: throw FamilyGraphException.InvalidGraph
            if (person.id == relative.id) throw FamilyGraphException.SelfRelationship
            if (person.treeId != relative.treeId) throw FamilyGraphException.CrossTreeRelationship
            val endpoints = relationshipEndpoints(person.id, relative.id, role)
            val stored = dao.relationships(person.treeId).map { it.toModel() }
            if (stored.any {
                    it.kind == endpoints.kind && it.fromPersonId == endpoints.fromPersonId &&
                        it.toPersonId == endpoints.toPersonId
                }
            ) throw FamilyGraphException.DuplicateRelationship
            FamilyRelationship(
                treeId = person.treeId,
                fromPersonId = endpoints.fromPersonId,
                toPersonId = endpoints.toPersonId,
                kind = endpoints.kind,
                subtype = endpoints.subtype,
            ).also { dao.insertRelationships(listOf(it.toEntity())) }
        }

    suspend fun addRelative(
        personId: String,
        name: String,
        role: RelativeRole,
        details: PersonDetails = PersonDetails(),
        marriageDate: Instant? = null,
        coParentId: String? = null,
    ): Person = database.withTransaction {
        val person = dao.person(personId)?.toModel() ?: throw FamilyGraphException.InvalidGraph
        val stored = dao.relationships(person.treeId).map { it.toModel() }
        val coParent = coParentId?.let { dao.person(it)?.toModel() ?: throw FamilyGraphException.InvalidCoParent }
        if (coParent != null && !FamilyGraph.isValidCoParent(person, coParent, role, stored)) {
            throw FamilyGraphException.InvalidCoParent
        }
        val normalized = FamilyGraph.normalizedDetails(details)
        val relative = Person(
            treeId = person.treeId,
            displayName = FamilyGraph.validatedName(name),
            gender = role.gender,
            birthDate = normalized.birthDate,
            deathDate = normalized.deathDate,
            birthDatePrecision = normalized.birthDatePrecision,
            notes = normalized.notes,
            addressLine = normalized.addressLine,
            city = normalized.city,
            province = normalized.province,
            country = normalized.country,
            postalCode = normalized.postalCode,
            profilePhotoData = normalized.profilePhotoData,
        )
        val endpoint = relationshipEndpoints(person.id, relative.id, role)
        val links = mutableListOf(FamilyRelationship(
            treeId = person.treeId,
            fromPersonId = endpoint.fromPersonId,
            toPersonId = endpoint.toPersonId,
            kind = endpoint.kind,
            subtype = endpoint.subtype,
            marriageDate = marriageDate.takeIf { endpoint.kind == RelationshipKind.PARTNER },
        ))
        coParent?.let {
            links += FamilyRelationship(
                treeId = person.treeId,
                fromPersonId = it.id,
                toPersonId = relative.id,
                kind = RelationshipKind.PARENT,
                subtype = endpoint.subtype,
            )
        }
        dao.insertPeople(listOf(relative.toEntity()))
        dao.insertRelationships(links.map { it.toEntity() })
        relative
    }

    suspend fun deletePerson(personId: String) = database.withTransaction {
        dao.person(personId)?.let { dao.deletePerson(it) }
    }

    suspend fun deleteRelationship(relationshipId: String, treeId: String) = database.withTransaction {
        dao.relationships(treeId).firstOrNull { it.id == relationshipId }?.let { dao.deleteRelationship(it) }
    }

    suspend fun exportPayload(treeId: String, exportedAt: Instant = Instant.now()): ArchivePayload =
        database.withTransaction {
            val tree = dao.tree(treeId)?.toModel() ?: throw FamilyGraphException.InvalidGraph
            ArchivePayload(
                exportedAt,
                tree,
                dao.people(treeId).map { it.toModel() },
                dao.relationships(treeId).map { it.toModel() },
            )
        }

    suspend fun importPayload(payload: ArchivePayload): FamilyTree {
        FamilyGraph.validate(payload.tree, payload.people, payload.relationships)
        return database.withTransaction {
            if (dao.tree(payload.tree.id) != null || payload.people.any { dao.person(it.id) != null } ||
                payload.relationships.any { dao.relationship(it.id) != null }
            ) throw ArchiveException.IdentifierCollision()
            dao.insertTree(payload.tree.toEntity())
            dao.insertPeople(payload.people.map { it.toEntity() })
            dao.insertRelationships(payload.relationships.map { it.toEntity() })
            payload.tree
        }
    }
}
