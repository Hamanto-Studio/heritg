package tech.robihamanto.heritg.android.core.tree

import tech.robihamanto.heritg.android.core.domain.EnglishSemanticFormatter
import tech.robihamanto.heritg.android.core.domain.FamilyRoleLabel
import tech.robihamanto.heritg.android.core.domain.KinshipResolver
import tech.robihamanto.heritg.android.core.domain.PersonSnapshot
import tech.robihamanto.heritg.android.core.domain.RelationshipSnapshot
import tech.robihamanto.heritg.android.core.domain.SemanticFormatter
import tech.robihamanto.heritg.android.core.model.PersonGender
import tech.robihamanto.heritg.android.core.model.RelationshipKind
import java.util.Locale

data class TreeNodeLayout(
    val id: String,
    val person: PersonSnapshot,
    val role: String,
    val position: Point,
)

data class TreeEdgeLayout(
    val id: String,
    val fromPersonId: String,
    val toPersonId: String,
    val from: Point,
    val to: Point,
    val kind: RelationshipKind,
    val subtype: tech.robihamanto.heritg.android.core.model.RelationshipSubtype,
    val marriageYear: String? = null,
) {
    fun marriageLabel(formatter: SemanticFormatter = EnglishSemanticFormatter): String? {
        if (kind != RelationshipKind.PARTNER || marriageYear == null) return null
        return "${formatter.text("Married")} $marriageYear"
    }
}

data class TreeLayoutResult(val nodes: List<TreeNodeLayout>, val edges: List<TreeEdgeLayout>)

object TreeLayout {
    fun make(
        focusedPersonId: String?,
        people: List<PersonSnapshot>,
        relationships: List<RelationshipSnapshot>,
        selectedPersonId: String? = null,
        generationLimits: TreeGenerationLimits = TreeGenerationLimits(),
        formatter: SemanticFormatter = EnglishSemanticFormatter,
    ): TreeLayoutResult = if (focusedPersonId == null) {
        entireTree(people, relationships, selectedPersonId, generationLimits, formatter)
    } else focusedTree(focusedPersonId, people, relationships, formatter)

    fun availableGenerationLevels(
        selectedPersonId: String?,
        people: List<PersonSnapshot>,
        relationships: List<RelationshipSnapshot>,
    ): AvailableGenerationLevels = GenerationFilter.availableLevels(
        selectedPersonId,
        people.mapTo(mutableSetOf()) { it.id },
        relationships,
        generationDepths(people, relationships),
    )

    private fun focusedTree(
        focusId: String,
        people: List<PersonSnapshot>,
        relationships: List<RelationshipSnapshot>,
        formatter: SemanticFormatter,
    ): TreeLayoutResult {
        val byId = people.associateBy { it.id }
        val focus = byId[focusId] ?: return TreeLayoutResult(emptyList(), emptyList())
        val parents = relationships.filter { it.kind == RelationshipKind.PARENT && it.toPersonId == focusId }
            .mapNotNull { byId[it.fromPersonId] }.sortedWith(familyComparator)
        val siblings = related(focusId, RelationshipKind.SIBLING, relationships, byId)
        val partners = related(focusId, RelationshipKind.PARTNER, relationships, byId)
        val focusedParentOrder = (listOf(focus) + partners).mapIndexed { index, person -> person.id to index }.toMap()
        val children = familyGroupedOrder(
            relationships.filter { it.kind == RelationshipKind.PARENT && it.fromPersonId == focusId }
                .mapNotNull { byId[it.toPersonId] },
            relationships,
            focusedParentOrder,
        )
        val nodes = mutableListOf(TreeNodeLayout(focus.id, focus, formatter.text("You"), Point(0.0, 0.0)))
        nodes += rowNodes(parents, -TreeVisualMetrics.GenerationSpacing, focusId, relationships, formatter)
        nodes += rowNodes(children, TreeVisualMetrics.GenerationSpacing, focusId, relationships, formatter)
        siblings.forEachIndexed { index, person ->
            nodes += node(person, focusId, relationships, Point(-(index + 1) * TreeVisualMetrics.HorizontalSpacing, 0.0), formatter)
        }
        partners.forEachIndexed { index, person ->
            nodes += node(person, focusId, relationships, Point((index + 1) * TreeVisualMetrics.HorizontalSpacing, 0.0), formatter)
        }
        return result(nodes.distinctBy { it.id }, relationships)
    }

    private fun entireTree(
        people: List<PersonSnapshot>,
        relationships: List<RelationshipSnapshot>,
        selectedId: String?,
        limits: TreeGenerationLimits,
        formatter: SemanticFormatter,
    ): TreeLayoutResult {
        val validIds = people.mapTo(mutableSetOf()) { it.id }
        val depths = generationDepths(people, relationships)
        val levels = GenerationFilter.layoutLevels(selectedId, validIds, relationships, depths, limits)
        val visible = GenerationFilter.visiblePersonIds(selectedId, validIds, relationships, depths, limits)
        val grouped = people.filter { it.id in visible }.groupBy { levels[it.id] ?: 0 }
        val kinship = selectedId?.let { KinshipResolver.indexed(people, relationships, formatter) }
        val parentedIds = relationships.asSequence().filter { it.kind == RelationshipKind.PARENT }
            .mapTo(mutableSetOf()) { it.toPersonId }
        val min = grouped.keys.minOrNull() ?: 0
        val max = grouped.keys.maxOrNull() ?: 0
        var parentOrder = emptyMap<String, Int>()
        val nodes = grouped.keys.sorted().flatMap { level ->
            val row = familyGroupedOrder(grouped.getValue(level), relationships, parentOrder)
            parentOrder = row.mapIndexed { index, person -> person.id to index }.toMap()
            val start = -maxOf(row.size - 1, 0) * TreeVisualMetrics.HorizontalSpacing / 2
            row.mapIndexed { index, person ->
                TreeNodeLayout(
                    person.id,
                    person,
                    selectedId?.let {
                        kinship?.label(person.id, it)
                    } ?: if (person.id in parentedIds) {
                        formatter.text("Child")
                    } else formatter.text("Family member"),
                    Point(
                        start + index * TreeVisualMetrics.HorizontalSpacing,
                        (level - (min + max) / 2.0) * TreeVisualMetrics.GenerationSpacing,
                    ),
                )
            }
        }
        val positions = nodes.associate { it.id to it.position }
        val edges = relationships.mapNotNull { relationship ->
            val from = positions[relationship.fromPersonId] ?: return@mapNotNull null
            val to = positions[relationship.toPersonId] ?: return@mapNotNull null
            val fromLevel = levels[relationship.fromPersonId] ?: 0
            val toLevel = levels[relationship.toPersonId] ?: 0
            if (relationship.kind == RelationshipKind.PARENT && toLevel != fromLevel + 1) return@mapNotNull null
            if (relationship.kind != RelationshipKind.PARENT && toLevel != fromLevel) return@mapNotNull null
            relationship.toLayout(from, to)
        }.sortedBy { it.id }
        return TreeLayoutResult(nodes, edges)
    }

    internal fun generationDepths(
        people: List<PersonSnapshot>,
        relationships: List<RelationshipSnapshot>,
    ): Map<String, Int> {
        val ids = people.mapTo(mutableSetOf()) { it.id }
        val constraints = mutableMapOf<String, MutableList<Pair<String, Int>>>()
        fun add(first: String, second: String, offset: Int) {
            if (first !in ids || second !in ids || first == second) return
            constraints.getOrPut(first, ::mutableListOf).add(second to offset)
            constraints.getOrPut(second, ::mutableListOf).add(first to -offset)
        }
        relationships.sortedWith(generationRelationshipComparator)
            .forEach { add(it.fromPersonId, it.toPersonId, if (it.kind == RelationshipKind.PARENT) 1 else 0) }
        relationships.filter { it.kind == RelationshipKind.PARENT }.groupBy { it.toPersonId }
            .toSortedMap().values.forEach { links ->
                val parentIds = links.mapTo(mutableSetOf()) { it.fromPersonId }.sorted()
                val firstParent = parentIds.firstOrNull() ?: return@forEach
                parentIds.drop(1).forEach { add(firstParent, it, 0) }
        }
        val parented = relationships.filter { it.kind == RelationshipKind.PARENT }.mapTo(mutableSetOf()) { it.toPersonId }
        val orderedIds = people.map { it.id }.sorted()
        val roots = orderedIds.filter { it !in parented }
        val rootIds = roots.toSet()
        val starts = roots + orderedIds.filter { it !in rootIds }
        val depths = mutableMapOf<String, Int>()
        starts.forEach { start ->
            if (start in depths) return@forEach
            depths[start] = 0
            val queue = ArrayDeque<String>().apply { add(start) }
            while (queue.isNotEmpty()) {
                val id = queue.removeFirst()
                constraints[id].orEmpty().forEach { (next, offset) ->
                    if (next !in depths) {
                        depths[next] = depths.getValue(id) + offset
                        queue.add(next)
                    }
                }
            }
        }
        return depths
    }

    private fun related(
        id: String,
        kind: RelationshipKind,
        relationships: List<RelationshipSnapshot>,
        people: Map<String, PersonSnapshot>,
    ) = relationships.filter { it.kind == kind && (it.fromPersonId == id || it.toPersonId == id) }
        .mapNotNull { people[if (it.fromPersonId == id) it.toPersonId else it.fromPersonId] }
        .sortedWith(familyComparator)

    private fun rowNodes(
        people: List<PersonSnapshot>,
        y: Double,
        focusId: String,
        relationships: List<RelationshipSnapshot>,
        formatter: SemanticFormatter,
    ): List<TreeNodeLayout> {
        val start = -maxOf(people.size - 1, 0) * 170.0 / 2
        return people.mapIndexed { index, person ->
            node(person, focusId, relationships, Point(start + index * 170.0, y), formatter)
        }
    }

    private fun node(
        person: PersonSnapshot,
        focusId: String,
        relationships: List<RelationshipSnapshot>,
        point: Point,
        formatter: SemanticFormatter,
    ): TreeNodeLayout {
        val relationship = relationships.firstOrNull {
            (it.fromPersonId == person.id && it.toPersonId == focusId) ||
                (it.toPersonId == person.id && it.fromPersonId == focusId)
        }
        val role = relationship?.let {
            FamilyRoleLabel.label(person.gender, it.kind, focusId, it.fromPersonId, it.toPersonId, it.subtype, formatter)
        } ?: formatter.text("Family")
        return TreeNodeLayout(person.id, person, role, point)
    }

    private fun result(nodes: List<TreeNodeLayout>, relationships: List<RelationshipSnapshot>): TreeLayoutResult {
        val positions = nodes.associate { it.id to it.position }
        return TreeLayoutResult(nodes, relationships.mapNotNull {
            val from = positions[it.fromPersonId] ?: return@mapNotNull null
            val to = positions[it.toPersonId] ?: return@mapNotNull null
            it.toLayout(from, to)
        }.sortedBy { it.id })
    }

    private fun RelationshipSnapshot.toLayout(from: Point, to: Point) = TreeEdgeLayout(
        id, fromPersonId, toPersonId, from, to, kind, subtype, marriageYear,
    )

    private fun familyGroupedOrder(
        people: List<PersonSnapshot>,
        relationships: List<RelationshipSnapshot>,
        parentOrder: Map<String, Int> = emptyMap(),
    ): List<PersonSnapshot> {
        val peopleById = people.associateBy { it.id }
        val personIds = peopleById.keys
        val parentIdsByPerson = mutableMapOf<String, MutableSet<String>>()
        relationships.filter { it.kind == RelationshipKind.PARENT && it.toPersonId in personIds }.forEach {
            parentIdsByPerson.getOrPut(it.toPersonId, ::mutableSetOf).add(it.fromPersonId)
        }
        val parentedPeople = people.filter { !parentIdsByPerson[it.id].isNullOrEmpty() }
        if (parentedPeople.isEmpty()) return coupleAwareOrder(people, relationships)

        val partnerIdsByPerson = mutableMapOf<String, MutableSet<String>>()
        relationships.filter {
            it.kind == RelationshipKind.PARTNER && it.fromPersonId in personIds && it.toPersonId in personIds
        }.forEach {
            partnerIdsByPerson.getOrPut(it.fromPersonId, ::mutableSetOf).add(it.toPersonId)
            partnerIdsByPerson.getOrPut(it.toPersonId, ::mutableSetOf).add(it.fromPersonId)
        }

        val blocks = parentedPeople.groupBy { parentIdsByPerson.getValue(it.id).sorted().joinToString("|") }
            .map { (key, members) ->
                FamilyBlock(
                    key,
                    members.sortedWith(chronologicalComparator),
                    parentIdsByPerson.getValue(members.first().id).mapNotNull(parentOrder::get).sorted(),
                )
            }.sortedWith { first, second ->
                compareRankLists(first.parentRanks, second.parentRanks).takeIf { it != 0 }
                    ?: chronologicalComparator.compare(first.members.first(), second.members.first()).takeIf { it != 0 }
                    ?: first.key.compareTo(second.key)
            }

        val added = parentedPeople.mapTo(mutableSetOf()) { it.id }
        val result = mutableListOf<PersonSnapshot>()
        blocks.forEach { block ->
            result += block.members
            val attachedIds = mutableSetOf<String>()
            val queue = ArrayDeque(block.members.map { it.id })
            while (queue.isNotEmpty()) {
                partnerIdsByPerson[queue.removeFirst()].orEmpty().sorted().forEach { partnerId ->
                    if (parentIdsByPerson[partnerId].isNullOrEmpty() && partnerId !in added) {
                        added += partnerId
                        attachedIds += partnerId
                        queue += partnerId
                    }
                }
            }
            val attached = people.filter { it.id in attachedIds }.sortedWith(chronologicalComparator)
            result += coupleAwareOrder(attached, relationships)
        }
        val remaining = people.filter { it.id !in added }.sortedWith(chronologicalComparator)
        result += coupleAwareOrder(remaining, relationships)
        return result
    }

    private fun coupleAwareOrder(
        people: List<PersonSnapshot>,
        relationships: List<RelationshipSnapshot>,
    ): List<PersonSnapshot> {
        if (people.size <= 1) return people
        val visibleIds = people.mapTo(mutableSetOf()) { it.id }
        val peopleById = people.associateBy { it.id }
        val baselineIndex = people.mapIndexed { index, person -> person.id to index }.toMap()
        val parentIdsByPerson = mutableMapOf<String, MutableSet<String>>()
        val parentIdsByChild = mutableMapOf<String, MutableSet<String>>()
        relationships.filter { it.kind == RelationshipKind.PARENT }.forEach {
            parentIdsByChild.getOrPut(it.toPersonId, ::mutableSetOf).add(it.fromPersonId)
            if (it.toPersonId in visibleIds) {
                parentIdsByPerson.getOrPut(it.toPersonId, ::mutableSetOf).add(it.fromPersonId)
            }
        }
        fun hasSharedChild(relationship: RelationshipSnapshot) = parentIdsByChild.values.any {
            relationship.fromPersonId in it && relationship.toPersonId in it
        }
        val activeUnions = relationships.filter {
            it.kind == RelationshipKind.PARTNER && it.subtype.isActiveUnion &&
                it.fromPersonId in visibleIds && it.toPersonId in visibleIds
        }.sortedWith(
            compareByDescending<RelationshipSnapshot>(::hasSharedChild)
                .thenByDescending { it.subtype == tech.robihamanto.heritg.android.core.model.RelationshipSubtype.SPOUSE }
                .thenBy { kotlin.math.abs(baselineIndex.getValue(it.fromPersonId) - baselineIndex.getValue(it.toPersonId)) }
                .thenBy { it.id },
        )

        val blocks = people.mapTo(mutableListOf()) { mutableListOf(it.id) }
        activeUnions.forEach { relationship ->
            val firstIndex = blocks.indexOfFirst { relationship.fromPersonId in it }
            val secondIndex = blocks.indexOfFirst { relationship.toPersonId in it }
            if (firstIndex < 0 || secondIndex < 0 || firstIndex == secondIndex) return@forEach
            val firstBlock = blocks[firstIndex]
            val secondBlock = blocks[secondIndex]
            val candidates = mutableListOf<List<String>>()
            endingOrientations(firstBlock, relationship.fromPersonId).forEach { first ->
                startingOrientations(secondBlock, relationship.toPersonId).forEach { second -> candidates += first + second }
            }
            endingOrientations(secondBlock, relationship.toPersonId).forEach { second ->
                startingOrientations(firstBlock, relationship.fromPersonId).forEach { first -> candidates += second + first }
            }
            if (candidates.isEmpty()) return@forEach
            val insertionIndex = minOf(firstIndex, secondIndex)
            val best = candidates.minWith { first, second ->
                val firstOrder = proposedOrder(blocks, firstIndex, secondIndex, insertionIndex, first)
                val secondOrder = proposedOrder(blocks, firstIndex, secondIndex, insertionIndex, second)
                compareScores(
                    coupleOrderScore(firstOrder, peopleById, parentIdsByPerson, baselineIndex),
                    coupleOrderScore(secondOrder, peopleById, parentIdsByPerson, baselineIndex),
                )
            }
            blocks.removeAt(maxOf(firstIndex, secondIndex))
            blocks.removeAt(minOf(firstIndex, secondIndex))
            blocks.add(insertionIndex, best.toMutableList())
        }
        return blocks.flatten().mapNotNull(peopleById::get)
    }

    private fun proposedOrder(
        blocks: List<List<String>>,
        firstIndex: Int,
        secondIndex: Int,
        insertionIndex: Int,
        candidate: List<String>,
    ): List<String> {
        val proposed = blocks.map { it.toList() }.toMutableList()
        proposed.removeAt(maxOf(firstIndex, secondIndex))
        proposed.removeAt(minOf(firstIndex, secondIndex))
        proposed.add(insertionIndex, candidate)
        return proposed.flatten()
    }

    private fun startingOrientations(block: List<String>, id: String) = buildList {
        if (block.first() == id) add(block)
        if (block.size > 1 && block.last() == id) add(block.reversed())
    }

    private fun endingOrientations(block: List<String>, id: String) = buildList {
        if (block.last() == id) add(block)
        if (block.size > 1 && block.first() == id) add(block.reversed())
    }

    private fun coupleOrderScore(
        order: List<String>,
        peopleById: Map<String, PersonSnapshot>,
        parentIdsByPerson: Map<String, Set<String>>,
        baselineIndex: Map<String, Int>,
    ): CoupleOrderScore {
        val orderIndex = order.mapIndexed { index, id -> id to index }.toMap()
        var siblingInversions = 0
        var baselineInversions = 0
        order.indices.forEach { firstIndex ->
            ((firstIndex + 1)..<order.size).forEach { secondIndex ->
                val firstId = order[firstIndex]
                val secondId = order[secondIndex]
                if (baselineIndex.getValue(firstId) > baselineIndex.getValue(secondId)) baselineInversions++
                val firstParents = parentIdsByPerson[firstId].orEmpty()
                val first = peopleById[firstId]
                val second = peopleById[secondId]
                if (firstParents.isEmpty() || firstParents != parentIdsByPerson[secondId].orEmpty() || first == null || second == null) {
                    return@forEach
                }
                val comparison = chronologicalComparator.compare(first, second)
                val firstBeforeSecond = if (comparison != 0) comparison < 0
                else baselineIndex.getValue(firstId) < baselineIndex.getValue(secondId)
                val inverted = if (firstBeforeSecond) orderIndex.getValue(firstId) > orderIndex.getValue(secondId)
                else orderIndex.getValue(secondId) > orderIndex.getValue(firstId)
                if (inverted) siblingInversions++
            }
        }
        return CoupleOrderScore(siblingInversions, baselineInversions, order.joinToString("\u001f"))
    }

    private val familyComparator = compareBy<PersonSnapshot>(
        { when (it.gender) { PersonGender.MALE -> 0; PersonGender.FEMALE -> 1; PersonGender.UNSPECIFIED -> 2 } },
        { it.name.lowercase(Locale.ROOT) },
        { it.name },
        { it.id },
    )
    private val chronologicalComparator = compareBy<PersonSnapshot> { it.birthEpochMillis == null }
        .thenBy { it.birthEpochMillis }
        .then(familyComparator)
    private val generationRelationshipComparator = compareBy<RelationshipSnapshot>(
        { if (it.kind == RelationshipKind.PARENT) 0 else 1 },
        { it.fromPersonId },
        { it.toPersonId },
        { it.id },
    )

    private fun compareRankLists(first: List<Int>, second: List<Int>): Int {
        if (first != second) {
            if (first.isEmpty()) return 1
            if (second.isEmpty()) return -1
            first.indices.take(minOf(first.size, second.size)).forEach { index ->
                first[index].compareTo(second[index]).takeIf { it != 0 }?.let { return it }
            }
            return first.size.compareTo(second.size)
        }
        return 0
    }

    private fun compareScores(first: CoupleOrderScore, second: CoupleOrderScore): Int =
        first.siblingInversions.compareTo(second.siblingInversions).takeIf { it != 0 }
            ?: first.baselineInversions.compareTo(second.baselineInversions).takeIf { it != 0 }
            ?: first.stableKey.compareTo(second.stableKey)

    private data class FamilyBlock(
        val key: String,
        val members: List<PersonSnapshot>,
        val parentRanks: List<Int>,
    )

    private data class CoupleOrderScore(
        val siblingInversions: Int,
        val baselineInversions: Int,
        val stableKey: String,
    )
}
