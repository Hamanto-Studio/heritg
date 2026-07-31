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
    ): String? = indexed(people, relationships, formatter).label(personId, referenceId)

    fun indexed(
        people: Collection<PersonSnapshot>,
        relationships: Collection<RelationshipSnapshot>,
        formatter: SemanticFormatter = EnglishSemanticFormatter,
    ): Resolver = Resolver(people, relationships, formatter)

    class Resolver internal constructor(
        people: Collection<PersonSnapshot>,
        relationships: Collection<RelationshipSnapshot>,
        private val formatter: SemanticFormatter,
    ) {
        private val peopleById = people.associateBy { it.id }
        private val directByPair = linkedMapOf<PersonPair, RelationshipSnapshot>()
        private val parentsByChild = mutableMapOf<String, MutableSet<String>>()
        private val childrenByParent = mutableMapOf<String, MutableSet<String>>()
        private val activePartnersByPerson = mutableMapOf<String, MutableSet<String>>()
        private val siblingsByPerson = mutableMapOf<String, MutableSet<String>>()
        private val ancestorCache = mutableMapOf<String, Map<String, Int>>()

        init {
            relationships.sortedWith(relationshipComparator).forEach { relationship ->
                directByPair.putIfAbsent(
                    PersonPair.of(relationship.fromPersonId, relationship.toPersonId),
                    relationship,
                )
                when {
                    relationship.kind == RelationshipKind.PARENT && relationship.subtype.contributesToAncestry -> {
                        parentsByChild.getOrPut(relationship.toPersonId, ::mutableSetOf)
                            .add(relationship.fromPersonId)
                        childrenByParent.getOrPut(relationship.fromPersonId, ::mutableSetOf)
                            .add(relationship.toPersonId)
                    }
                    relationship.kind == RelationshipKind.PARTNER && relationship.subtype.isActiveUnion -> {
                        activePartnersByPerson.getOrPut(relationship.fromPersonId, ::mutableSetOf)
                            .add(relationship.toPersonId)
                        activePartnersByPerson.getOrPut(relationship.toPersonId, ::mutableSetOf)
                            .add(relationship.fromPersonId)
                    }
                    relationship.kind == RelationshipKind.SIBLING -> {
                        siblingsByPerson.getOrPut(relationship.fromPersonId, ::mutableSetOf)
                            .add(relationship.toPersonId)
                        siblingsByPerson.getOrPut(relationship.toPersonId, ::mutableSetOf)
                            .add(relationship.fromPersonId)
                    }
                }
            }
        }

        fun label(personId: String, referenceId: String): String? {
            if (personId == referenceId) return formatter.text("You")
            val person = peopleById[personId] ?: return null
            if (referenceId !in peopleById) return null
            return direct(person, referenceId)
                ?: lineage(person, referenceId)
                ?: step(person, referenceId)
                ?: inLaw(person, referenceId)
        }

        private fun direct(person: PersonSnapshot, referenceId: String): String? =
            directByPair[PersonPair.of(person.id, referenceId)]?.let {
                FamilyRoleLabel.label(
                    person.gender, it.kind, referenceId, it.fromPersonId, it.toPersonId, it.subtype, formatter,
                )
            }

        private fun lineage(person: PersonSnapshot, referenceId: String): String? {
            val personAncestors = ancestorDistances(person.id)
            val referenceAncestors = ancestorDistances(referenceId)
            referenceAncestors[person.id]?.let { return generation(it, person.gender, true) }
            personAncestors[referenceId]?.let { return generation(it, person.gender, false) }
            val closest = personAncestors.keys.asSequence().filter { it in referenceAncestors }.minWithOrNull(
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
                return addGreat(base, maxOf(referenceDistance - 2, 0))
            }
            if (referenceDistance == 1) {
                val base = gendered(person.gender, "Nephew", "Niece", "Niece/Nephew", formatter)
                return addGreat(base, maxOf(personDistance - 2, 0))
            }
            return cousin(
                minOf(personDistance, referenceDistance) - 1,
                kotlin.math.abs(personDistance - referenceDistance),
            )
        }

        private fun step(person: PersonSnapshot, referenceId: String): String? {
            val referenceParents = parents(referenceId)
            if (referenceParents.any { person.id in activePartners(it) }) {
                return gendered(person.gender, "Stepfather", "Stepmother", "Step-parent", formatter)
            }
            if (activePartners(referenceId).any { it in parents(person.id) }) {
                return gendered(person.gender, "Stepson", "Stepdaughter", "Stepchild", formatter)
            }
            if (referenceParents.any { parent -> activePartners(parent).any { it in parents(person.id) } }) {
                return gendered(person.gender, "Stepbrother", "Stepsister", "Stepsibling", formatter)
            }
            return null
        }

        private fun inLaw(person: PersonSnapshot, referenceId: String): String? {
            val partners = activePartners(referenceId)
            if (partners.any { person.id in parents(it) }) {
                return gendered(person.gender, "Father-in-law", "Mother-in-law", "Parent-in-law", formatter)
            }
            if (children(referenceId).any { person.id in activePartners(it) }) {
                return gendered(person.gender, "Son-in-law", "Daughter-in-law", "Child-in-law", formatter)
            }
            if (partners.any { areSiblings(person.id, it) } ||
                activePartners(person.id).any { areSiblings(it, referenceId) }
            ) return gendered(person.gender, "Brother-in-law", "Sister-in-law", "Sibling-in-law", formatter)
            partners.forEach { partner ->
                if (partner in peopleById) {
                    lineage(person, partner)?.let { return formatter.text("byMarriage", it) }
                }
            }
            return null
        }

        private fun ancestorDistances(personId: String): Map<String, Int> = ancestorCache.getOrPut(personId) {
            val result = mutableMapOf<String, Int>()
            val queue = ArrayDeque<Pair<String, Int>>().apply { add(personId to 0) }
            while (queue.isNotEmpty()) {
                val (current, distance) = queue.removeFirst()
                parents(current).sorted().forEach { parent ->
                    if (parent != personId && parent !in result) {
                        result[parent] = distance + 1
                        queue.add(parent to distance + 1)
                    }
                }
            }
            result
        }

        private fun parents(id: String): Set<String> = parentsByChild[id].orEmpty()
        private fun children(id: String): Set<String> = childrenByParent[id].orEmpty()
        private fun activePartners(id: String): Set<String> = activePartnersByPerson[id].orEmpty()
        private fun areSiblings(first: String, second: String): Boolean =
            second in siblingsByPerson[first].orEmpty() || parents(first).any { it in parents(second) }

        private fun generation(distance: Int, gender: PersonGender, ancestor: Boolean): String {
            if (distance == 1) return if (ancestor) {
                gendered(gender, "Father", "Mother", "Parent", formatter)
            } else gendered(gender, "Son", "Daughter", "Child", formatter)
            val base = if (ancestor) {
                gendered(gender, "Grandfather", "Grandmother", "Grandparent", formatter)
            } else gendered(gender, "Grandson", "Granddaughter", "Grandchild", formatter)
            return addGreat(base, maxOf(distance - 2, 0))
        }

        private fun cousin(degree: Int, removal: Int): String {
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

        private fun addGreat(label: String, count: Int): String =
            (0 until count).fold(label) { current, _ -> formatter.text("great", current) }
    }

    private data class PersonPair(val first: String, val second: String) {
        companion object {
            fun of(first: String, second: String) =
                if (first <= second) PersonPair(first, second) else PersonPair(second, first)
        }
    }

    private val relationshipComparator = compareBy<RelationshipSnapshot>(
        { when (it.kind) { RelationshipKind.PARENT -> 0; RelationshipKind.PARTNER -> 1; RelationshipKind.SIBLING -> 2 } },
        { it.fromPersonId },
        { it.toPersonId },
        { it.subtype.wireName },
        { it.id },
    )
}
