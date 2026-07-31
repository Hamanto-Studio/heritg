package tech.robihamanto.heritg.android.core.domain

import tech.robihamanto.heritg.android.core.model.FamilyRelationship
import tech.robihamanto.heritg.android.core.model.FamilyTree
import tech.robihamanto.heritg.android.core.model.Person
import tech.robihamanto.heritg.android.core.model.PersonDetails
import tech.robihamanto.heritg.android.core.model.RelationshipKind

sealed class FamilyGraphException(message: String) : IllegalArgumentException(message) {
    data object EmptyName : FamilyGraphException("Name must not be blank")
    data object SelfRelationship : FamilyGraphException("A person cannot be related to themselves")
    data object DuplicateRelationship : FamilyGraphException("The relationship already exists")
    data object DeathBeforeBirth : FamilyGraphException("Death cannot precede birth")
    data object CrossTreeRelationship : FamilyGraphException("Relationship endpoints must share a tree")
    data object InvalidCoParent : FamilyGraphException("Co-parent must be an active partner")
    data object InvalidGraph : FamilyGraphException("Family graph is invalid")
}

object FamilyGraph {
    fun validatedName(value: String): String = value.trim().ifEmpty { throw FamilyGraphException.EmptyName }

    fun normalizedDetails(details: PersonDetails): PersonDetails {
        if (details.birthDate != null && details.deathDate != null && details.deathDate < details.birthDate) {
            throw FamilyGraphException.DeathBeforeBirth
        }
        return details.copy(
            notes = details.notes.trim(),
            addressLine = details.addressLine.trim(),
            city = details.city.trim(),
            province = details.province.trim(),
            country = details.country.trim(),
            postalCode = details.postalCode.trim(),
        )
    }

    fun activePartners(
        person: Person,
        people: Collection<Person>,
        relationships: Collection<FamilyRelationship>,
    ): List<Person> {
        val ids = relationships.asSequence().filter {
            it.treeId == person.treeId && it.kind == RelationshipKind.PARTNER && it.subtype.isActiveUnion
        }.mapNotNull {
            when (person.id) {
                it.fromPersonId -> it.toPersonId
                it.toPersonId -> it.fromPersonId
                else -> null
            }
        }.toSet()
        return people.filter { it.treeId == person.treeId && it.id in ids }
    }

    fun isValidCoParent(
        person: Person,
        coParent: Person,
        role: RelativeRole,
        relationships: Collection<FamilyRelationship>,
    ): Boolean = role.allowsCoParent && person.id != coParent.id && person.treeId == coParent.treeId &&
        relationships.any {
            it.treeId == person.treeId && it.kind == RelationshipKind.PARTNER &&
                it.subtype.isActiveUnion &&
                setOf(it.fromPersonId, it.toPersonId) == setOf(person.id, coParent.id)
        }

    fun validate(
        tree: FamilyTree,
        people: Collection<Person>,
        relationships: Collection<FamilyRelationship>,
    ) {
        validatedName(tree.title)
        val personIds = people.map { it.id }
        if (personIds.toSet().size != personIds.size || people.any { it.treeId != tree.id }) {
            throw FamilyGraphException.InvalidGraph
        }
        if (tree.lastSelectedPersonId != null && tree.lastSelectedPersonId !in personIds) {
            throw FamilyGraphException.InvalidGraph
        }
        people.forEach {
            validatedName(it.displayName)
            if (it.birthDate != null && it.deathDate != null && it.deathDate < it.birthDate) {
                throw FamilyGraphException.DeathBeforeBirth
            }
        }
        val signatures = mutableSetOf<String>()
        val relationshipIds = mutableSetOf<String>()
        relationships.forEach { relationship ->
            if (!relationshipIds.add(relationship.id) || relationship.treeId != tree.id ||
                relationship.fromPersonId == relationship.toPersonId ||
                relationship.fromPersonId !in personIds || relationship.toPersonId !in personIds ||
                !relationship.subtype.isValidFor(relationship.kind)
            ) throw FamilyGraphException.InvalidGraph
            val endpoints = canonicalEndpoints(
                relationship.kind,
                relationship.fromPersonId,
                relationship.toPersonId,
            )
            val signature = "${relationship.kind.wireName}|${endpoints.first}|${endpoints.second}"
            if (!signatures.add(signature)) throw FamilyGraphException.DuplicateRelationship
        }
    }
}
