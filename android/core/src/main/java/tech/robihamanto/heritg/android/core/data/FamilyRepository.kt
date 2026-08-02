package tech.robihamanto.heritg.android.core.data

import android.database.sqlite.SQLiteConstraintException
import androidx.room.withTransaction
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
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

data class StagedRelationshipLink(
    val relativeId: String,
    val role: RelativeRole,
    val marriageDate: Instant?,
    val inferGender: Boolean,
)

class FamilyRepository(private val database: HeritgDatabase) {
    private val dao = database.familyDao()

    fun observeTrees(): Flow<List<FamilyTree>> = dao.observeTrees().map { list -> list.map { it.toModel() } }
    fun observeTreeCount(): Flow<Int> = dao.observeTreeCount()
    fun observePeople(treeId: String): Flow<List<Person>> = dao.observePeople(treeId).map { rows -> rows.map { it.toModel() } }
    fun observeRelationships(treeId: String): Flow<List<FamilyRelationship>> =
        dao.observeRelationships(treeId).map { rows -> rows.map { it.toModel() } }
    fun observeTreeCounts(treeId: String): Flow<Pair<Int, Int>> = combine(
        dao.observePeopleCount(treeId), dao.observeRelationshipCount(treeId), ::Pair,
    )
    fun observeTree(treeId: String): Flow<TreeState> = combine(
        observeTrees(), observePeople(treeId), observeRelationships(treeId),
    ) { trees, people, relationships -> TreeState(trees.firstOrNull { it.id == treeId }, people, relationships) }

    suspend fun treeCounts(treeId: String): Pair<Int, Int> = database.withTransaction {
        dao.peopleCount(treeId) to dao.relationshipCount(treeId)
    }

    suspend fun createTree(name: String): FamilyTree = database.withTransaction {
        FamilyTree(title = FamilyGraph.validatedName(name)).also { dao.insertTree(it.toEntity()) }
    }

    suspend fun renameTree(treeId: String, name: String) = database.withTransaction {
        val tree = dao.tree(treeId) ?: throw FamilyGraphException.InvalidGraph
        dao.updateTree(tree.copy(title = FamilyGraph.validatedName(name), updatedAtEpochMillis = Instant.now().toEpochMilli()))
    }

    suspend fun deleteTree(treeId: String): String? = database.withTransaction {
        val tree = dao.tree(treeId) ?: return@withTransaction dao.trees().firstOrNull()?.id
        val fallbackId = dao.trees().firstOrNull { it.id != treeId }?.id
        dao.deleteTree(tree)
        fallbackId
    }

    suspend fun createPerson(treeId: String, name: String): Person = database.withTransaction {
        val tree = dao.tree(treeId) ?: throw FamilyGraphException.InvalidGraph
        val person = Person(treeId = treeId, displayName = FamilyGraph.validatedName(name))
        dao.insertPeople(listOf(person.toEntity()))
        dao.updateTree(tree.copy(updatedAtEpochMillis = Instant.now().toEpochMilli()))
        person
    }

    suspend fun rememberSelectedPerson(treeId: String, personId: String?) = database.withTransaction {
        val tree = dao.tree(treeId) ?: return@withTransaction
        val valid = personId?.takeIf { dao.person(it)?.treeId == treeId }
        if (tree.lastSelectedPersonId != valid) dao.updateTree(tree.copy(lastSelectedPersonId = valid))
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
            if (relative.gender == PersonGender.UNSPECIFIED && role.gender != PersonGender.UNSPECIFIED) {
                dao.updatePerson(relative.copy(gender = role.gender).toEntity())
            }
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

    suspend fun deletePerson(personId: String): String? = database.withTransaction {
        val person = dao.person(personId) ?: return@withTransaction null
        val tree = dao.tree(person.treeId) ?: throw FamilyGraphException.InvalidGraph
        val fallback = dao.people(person.treeId).firstOrNull { it.id != personId }?.id
        if (tree.lastSelectedPersonId == personId) {
            dao.updateTree(tree.copy(lastSelectedPersonId = fallback))
        }
        dao.deletePerson(person)
        fallback
    }

    suspend fun deleteRelationship(relationshipId: String, treeId: String) = database.withTransaction {
        dao.relationships(treeId).firstOrNull { it.id == relationshipId }?.let { dao.deleteRelationship(it) }
    }

    suspend fun updateRelationship(
        relationshipId: String, treeId: String, focusedPersonId: String,
        role: RelativeRole, marriageDate: Instant?,
    ) =
        database.withTransaction {
            val current = dao.relationships(treeId).firstOrNull { it.id == relationshipId }?.toModel()
                ?: throw FamilyGraphException.InvalidGraph
            val relativeId = when (focusedPersonId) {
                current.fromPersonId -> current.toPersonId
                current.toPersonId -> current.fromPersonId
                else -> throw FamilyGraphException.InvalidGraph
            }
            val relative = dao.person(relativeId)?.toModel() ?: throw FamilyGraphException.InvalidGraph
            val endpoints = relationshipEndpoints(focusedPersonId, relativeId, role)
            if (relative.gender == PersonGender.UNSPECIFIED && role.gender != PersonGender.UNSPECIFIED) {
                dao.updatePerson(relative.copy(gender = role.gender).toEntity())
            }
            dao.deleteRelationship(current.toEntity())
            dao.insertRelationships(listOf(current.copy(
                fromPersonId = endpoints.fromPersonId,
                toPersonId = endpoints.toPersonId,
                kind = endpoints.kind,
                subtype = endpoints.subtype,
                marriageDate = marriageDate.takeIf { endpoints.kind == RelationshipKind.PARTNER },
            ).toEntity()))
        }

    suspend fun savePersonEdits(
        personId: String,
        name: String,
        gender: PersonGender,
        details: PersonDetails,
        relationshipIdsToDelete: Set<String>,
        links: List<StagedRelationshipLink>,
    ) = database.withTransaction {
        val current = dao.person(personId)?.toModel() ?: throw FamilyGraphException.InvalidGraph
        val normalized = FamilyGraph.normalizedDetails(details)
        val existing = dao.relationships(current.treeId)
        links.groupBy(StagedRelationshipLink::relativeId).values.forEach { relativeLinks ->
            val inferredGenders = relativeLinks.asSequence().filter(StagedRelationshipLink::inferGender)
                .map { it.role.gender }.filter { it != PersonGender.UNSPECIFIED }.toSet()
            if (inferredGenders.size > 1) throw FamilyGraphException.InvalidGraph
        }
        val editedRelationships = existing.filter { it.id in relationshipIdsToDelete }
        if (editedRelationships.size != relationshipIdsToDelete.size || editedRelationships.any {
                it.fromPersonId != current.id && it.toPersonId != current.id
            }
        ) throw FamilyGraphException.InvalidGraph
        dao.updatePerson(current.copy(
            displayName = FamilyGraph.validatedName(name), gender = gender,
            birthDate = normalized.birthDate, deathDate = normalized.deathDate,
            birthDatePrecision = normalized.birthDatePrecision, notes = normalized.notes,
            addressLine = normalized.addressLine, city = normalized.city, province = normalized.province,
            country = normalized.country, postalCode = normalized.postalCode,
            profilePhotoData = normalized.profilePhotoData,
        ).toEntity())
        existing.filter { it.id in relationshipIdsToDelete }.forEach { dao.deleteRelationship(it) }
        links.forEach { link ->
            val relative = dao.person(link.relativeId)?.toModel() ?: throw FamilyGraphException.InvalidGraph
            if (relative.id == current.id) throw FamilyGraphException.SelfRelationship
            if (relative.treeId != current.treeId) throw FamilyGraphException.CrossTreeRelationship
            if (link.inferGender && relative.gender == PersonGender.UNSPECIFIED &&
                link.role.gender != PersonGender.UNSPECIFIED
            ) {
                dao.updatePerson(relative.copy(gender = link.role.gender).toEntity())
            }
            val endpoint = relationshipEndpoints(current.id, relative.id, link.role)
            if (dao.relationships(current.treeId).any {
                    it.kindRaw == endpoint.kind.wireName && it.fromPersonId == endpoint.fromPersonId &&
                        it.toPersonId == endpoint.toPersonId
                }) throw FamilyGraphException.DuplicateRelationship
            dao.insertRelationships(listOf(FamilyRelationship(
                treeId = current.treeId, fromPersonId = endpoint.fromPersonId,
                toPersonId = endpoint.toPersonId, kind = endpoint.kind, subtype = endpoint.subtype,
                marriageDate = link.marriageDate.takeIf { endpoint.kind == RelationshipKind.PARTNER },
            ).toEntity()))
        }
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
        return try {
            database.withTransaction {
                if (dao.tree(payload.tree.id) != null || hasIdentifierCollision(payload)) {
                    throw ArchiveException.IdentifierCollision()
                }
                dao.insertTree(payload.tree.toEntity())
                dao.insertPeople(payload.people.map { it.toEntity() })
                dao.insertRelationships(payload.relationships.map { it.toEntity() })
                payload.tree
            }
        } catch (error: SQLiteConstraintException) {
            throw ArchiveException.IdentifierCollision()
        }
    }

    private suspend fun hasIdentifierCollision(payload: ArchivePayload): Boolean {
        payload.people.map { it.id }.chunked(IdentifierBatchSize).forEach {
            if (dao.existingPeopleCount(it) > 0) return true
        }
        payload.relationships.map { it.id }.chunked(IdentifierBatchSize).forEach {
            if (dao.existingRelationshipsCount(it) > 0) return true
        }
        return false
    }

    private companion object {
        const val IdentifierBatchSize = 900
    }
}

data class TreeState(
    val tree: FamilyTree?,
    val people: List<Person>,
    val relationships: List<FamilyRelationship>,
)
