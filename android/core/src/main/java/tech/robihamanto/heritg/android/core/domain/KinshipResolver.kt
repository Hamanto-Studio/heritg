package tech.robihamanto.heritg.android.core.domain

import tech.robihamanto.heritg.android.core.model.PersonGender
import tech.robihamanto.heritg.android.core.model.RelationshipKind
import tech.robihamanto.heritg.android.core.model.RelationshipSubtype

data class PersonSnapshot(
    val id: String,
    val name: String,
    val gender: PersonGender,
    val profilePhotoData: ByteArray? = null,
    val lifeSummary: String? = null,
    val birthEpochMillis: Long? = null,
)

data class RelationshipSnapshot(
    val id: String,
    val fromPersonId: String,
    val toPersonId: String,
    val kind: RelationshipKind,
    val subtype: RelationshipSubtype = RelationshipSubtype.defaultFor(kind),
    val marriageYear: String? = null,
)

object KinshipResolver {
    fun label(
        personId: String,
        referenceId: String,
        people: Collection<PersonSnapshot>,
        relationships: Collection<RelationshipSnapshot>,
        formatter: SemanticFormatter = EnglishSemanticFormatter,
    ): String? {
        if (personId == referenceId) return formatter.text("You")
        val byId = people.associateBy { it.id }
        val person = byId[personId] ?: return null
        if (referenceId !in byId) return null
        return direct(person, referenceId, relationships, formatter)
            ?: lineage(person, referenceId, relationships, formatter)
            ?: step(person, referenceId, relationships, formatter)
            ?: inLaw(person, referenceId, byId, relationships, formatter)
    }

    private fun direct(
        person: PersonSnapshot,
        referenceId: String,
        relationships: Collection<RelationshipSnapshot>,
        formatter: SemanticFormatter,
    ): String? = relationships.firstOrNull {
        (it.fromPersonId == person.id && it.toPersonId == referenceId) ||
            (it.toPersonId == person.id && it.fromPersonId == referenceId)
    }?.let {
        FamilyRoleLabel.label(
            person.gender, it.kind, referenceId, it.fromPersonId, it.toPersonId, it.subtype, formatter,
        )
    }

    private fun lineage(
        person: PersonSnapshot,
        referenceId: String,
        relationships: Collection<RelationshipSnapshot>,
        formatter: SemanticFormatter,
    ): String? {
        val personAncestors = ancestorDistances(person.id, relationships)
        val referenceAncestors = ancestorDistances(referenceId, relationships)
        referenceAncestors[person.id]?.let { return generation(it, person.gender, true, formatter) }
        personAncestors[referenceId]?.let { return generation(it, person.gender, false, formatter) }
        val closest = personAncestors.keys.intersect(referenceAncestors.keys).minWithOrNull(
            compareBy<String> { maxOf(personAncestors.getValue(it), referenceAncestors.getValue(it)) }
                .thenBy { personAncestors.getValue(it) + referenceAncestors.getValue(it) }
                .thenBy { it },
        ) ?: return null
        val personDistance = personAncestors.getValue(closest)
        val referenceDistance = referenceAncestors.getValue(closest)
        if (personDistance == 1 && referenceDistance == 1) {
            return gendered(person.gender, "Brother", "Sister", "Sibling", formatter)
        }
        if (personDistance == 1) {
            val base = gendered(person.gender, "Uncle", "Aunt", "Aunt/Uncle", formatter)
            return addGreat(base, maxOf(referenceDistance - 2, 0), formatter)
        }
        if (referenceDistance == 1) {
            val base = gendered(person.gender, "Nephew", "Niece", "Niece/Nephew", formatter)
            return addGreat(base, maxOf(personDistance - 2, 0), formatter)
        }
        return cousin(
            minOf(personDistance, referenceDistance) - 1,
            kotlin.math.abs(personDistance - referenceDistance),
            formatter,
        )
    }

    private fun step(
        person: PersonSnapshot,
        referenceId: String,
        relationships: Collection<RelationshipSnapshot>,
        formatter: SemanticFormatter,
    ): String? {
        val referenceParents = parentIds(referenceId, relationships)
        if (referenceParents.any { person.id in activePartnerIds(it, relationships) }) {
            return gendered(person.gender, "Stepfather", "Stepmother", "Step-parent", formatter)
        }
        if (activePartnerIds(referenceId, relationships).any { it in parentIds(person.id, relationships) }) {
            return gendered(person.gender, "Stepson", "Stepdaughter", "Stepchild", formatter)
        }
        if (referenceParents.any { parent ->
                activePartnerIds(parent, relationships).any { it in parentIds(person.id, relationships) }
            }
        ) return gendered(person.gender, "Stepbrother", "Stepsister", "Stepsibling", formatter)
        return null
    }

    private fun inLaw(
        person: PersonSnapshot,
        referenceId: String,
        peopleById: Map<String, PersonSnapshot>,
        relationships: Collection<RelationshipSnapshot>,
        formatter: SemanticFormatter,
    ): String? {
        val partners = activePartnerIds(referenceId, relationships)
        if (partners.any { person.id in parentIds(it, relationships) }) {
            return gendered(person.gender, "Father-in-law", "Mother-in-law", "Parent-in-law", formatter)
        }
        if (childIds(referenceId, relationships).any { person.id in activePartnerIds(it, relationships) }) {
            return gendered(person.gender, "Son-in-law", "Daughter-in-law", "Child-in-law", formatter)
        }
        if (partners.any { areSiblings(person.id, it, relationships) } ||
            activePartnerIds(person.id, relationships).any { areSiblings(it, referenceId, relationships) }
        ) return gendered(person.gender, "Brother-in-law", "Sister-in-law", "Sibling-in-law", formatter)
        partners.forEach { partner ->
            if (partner in peopleById) {
                lineage(person, partner, relationships, formatter)?.let {
                    return formatter.text("byMarriage", it)
                }
            }
        }
        return null
    }

    private fun ancestorDistances(
        personId: String,
        relationships: Collection<RelationshipSnapshot>,
    ): Map<String, Int> {
        val result = mutableMapOf<String, Int>()
        val queue = ArrayDeque<Pair<String, Int>>().apply { add(personId to 0) }
        while (queue.isNotEmpty()) {
            val (current, distance) = queue.removeFirst()
            relationships.asSequence().filter {
                it.kind == RelationshipKind.PARENT && it.subtype.contributesToAncestry &&
                    it.toPersonId == current && it.fromPersonId != personId && it.fromPersonId !in result
            }.forEach {
                result[it.fromPersonId] = distance + 1
                queue.add(it.fromPersonId to distance + 1)
            }
        }
        return result
    }

    private fun parentIds(id: String, relationships: Collection<RelationshipSnapshot>): Set<String> =
        relationships.asSequence().filter {
            it.kind == RelationshipKind.PARENT && it.subtype.contributesToAncestry && it.toPersonId == id
        }.map { it.fromPersonId }.toSet()

    private fun childIds(id: String, relationships: Collection<RelationshipSnapshot>): Set<String> =
        relationships.asSequence().filter {
            it.kind == RelationshipKind.PARENT && it.subtype.contributesToAncestry && it.fromPersonId == id
        }.map { it.toPersonId }.toSet()

    private fun activePartnerIds(id: String, relationships: Collection<RelationshipSnapshot>): Set<String> =
        relationships.asSequence().filter {
            it.kind == RelationshipKind.PARTNER && it.subtype.isActiveUnion
        }.mapNotNull {
            when (id) {
                it.fromPersonId -> it.toPersonId
                it.toPersonId -> it.fromPersonId
                else -> null
            }
        }.toSet()

    private fun areSiblings(
        first: String,
        second: String,
        relationships: Collection<RelationshipSnapshot>,
    ): Boolean = relationships.any {
        it.kind == RelationshipKind.SIBLING &&
            setOf(it.fromPersonId, it.toPersonId) == setOf(first, second)
    } || parentIds(first, relationships).intersect(parentIds(second, relationships)).isNotEmpty()

    private fun generation(
        distance: Int,
        gender: PersonGender,
        ancestor: Boolean,
        formatter: SemanticFormatter,
    ): String {
        if (distance == 1) return if (ancestor) {
            gendered(gender, "Father", "Mother", "Parent", formatter)
        } else gendered(gender, "Son", "Daughter", "Child", formatter)
        val base = if (ancestor) gendered(gender, "Grandfather", "Grandmother", "Grandparent", formatter)
        else gendered(gender, "Grandson", "Granddaughter", "Grandchild", formatter)
        return addGreat(base, maxOf(distance - 2, 0), formatter)
    }

    private fun cousin(degree: Int, removal: Int, formatter: SemanticFormatter): String {
        val base = when (degree) {
            1 -> formatter.text("First cousin")
            2 -> formatter.text("Second cousin")
            3 -> formatter.text("Third cousin")
            else -> formatter.text("cousinNth", degree)
        }
        return when (removal) {
            0 -> base
            1 -> formatter.text("onceRemoved", base)
            2 -> formatter.text("twiceRemoved", base)
            else -> formatter.text("timesRemoved", base, removal)
        }
    }

    private fun addGreat(label: String, count: Int, formatter: SemanticFormatter): String =
        (0 until count).fold(label) { current, _ -> formatter.text("great", current) }
}
