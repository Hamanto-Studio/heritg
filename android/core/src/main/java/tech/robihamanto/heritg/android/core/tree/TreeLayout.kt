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

data class Point(val x: Double, val y: Double)

object TreeVisualMetrics {
    const val MinimumTapTarget = 44.0
    const val AvatarDiameter = 64.0
    const val AvatarRadius = 32.0
    const val HorizontalSpacing = 260.0
    const val GenerationSpacing = 260.0
    const val LabelOffset = 66.0
    const val LabelHeight = 72.0
    const val NodeLabelWidth = 190.0
    const val NodeLabelTopSpacing = 10.0

    fun nodeLabelHeight(showsRelationship: Boolean, showsLifeSummary: Boolean): Double =
        20.0 + (if (showsRelationship) 20.0 else 0.0) + (if (showsLifeSummary) 16.0 else 0.0)

    fun nodeLabelBottomOffset(showsRelationship: Boolean, showsLifeSummary: Boolean): Double =
        AvatarRadius + NodeLabelTopSpacing + nodeLabelHeight(showsRelationship, showsLifeSummary)
}

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
        if (kind != RelationshipKind.PARTNER) return null
        return when (subtype) {
            tech.robihamanto.heritg.android.core.model.RelationshipSubtype.SPOUSE ->
                marriageYear?.let { "${formatter.text("Married")} $it" } ?: formatter.text("Married")
            tech.robihamanto.heritg.android.core.model.RelationshipSubtype.FORMER_SPOUSE -> formatter.text("Former spouse")
            tech.robihamanto.heritg.android.core.model.RelationshipSubtype.FORMER_PARTNER -> formatter.text("Former partner")
            else -> formatter.text("Partner")
        }
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
        val children = relationships.filter { it.kind == RelationshipKind.PARENT && it.fromPersonId == focusId }
            .mapNotNull { byId[it.toPersonId] }.distinctBy { it.id }.sortedWith(chronologicalComparator)
        val siblings = related(focusId, RelationshipKind.SIBLING, relationships, byId)
        val partners = related(focusId, RelationshipKind.PARTNER, relationships, byId)
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
        val min = grouped.keys.minOrNull() ?: 0
        val max = grouped.keys.maxOrNull() ?: 0
        val nodes = grouped.keys.sorted().flatMap { level ->
            val row = grouped.getValue(level).sortedWith(chronologicalComparator)
            val start = -maxOf(row.size - 1, 0) * TreeVisualMetrics.HorizontalSpacing / 2
            row.mapIndexed { index, person ->
                TreeNodeLayout(
                    person.id,
                    person,
                    selectedId?.let {
                        KinshipResolver.label(person.id, it, people, relationships, formatter)
                    } ?: if (relationships.any { it.kind == RelationshipKind.PARENT && it.toPersonId == person.id }) {
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
        val edges = relationships.sortedBy { it.id }.mapNotNull { relationship ->
            val from = positions[relationship.fromPersonId] ?: return@mapNotNull null
            val to = positions[relationship.toPersonId] ?: return@mapNotNull null
            val fromLevel = levels[relationship.fromPersonId] ?: 0
            val toLevel = levels[relationship.toPersonId] ?: 0
            if (relationship.kind == RelationshipKind.PARENT && toLevel != fromLevel + 1) return@mapNotNull null
            if (relationship.kind != RelationshipKind.PARENT && toLevel != fromLevel) return@mapNotNull null
            relationship.toLayout(from, to)
        }
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
        relationships.sortedWith(compareBy<RelationshipSnapshot> { if (it.kind == RelationshipKind.PARENT) 0 else 1 }.thenBy { it.id })
            .forEach { add(it.fromPersonId, it.toPersonId, if (it.kind == RelationshipKind.PARENT) 1 else 0) }
        relationships.filter { it.kind == RelationshipKind.PARENT }.groupBy { it.toPersonId }.values.forEach { links ->
            links.map { it.fromPersonId }.distinct().sorted().let { parents ->
                parents.drop(1).forEach { add(parents.first(), it, 0) }
            }
        }
        val parented = relationships.filter { it.kind == RelationshipKind.PARENT }.mapTo(mutableSetOf()) { it.toPersonId }
        val starts = people.map { it.id }.filter { it !in parented } + people.map { it.id }
        val depths = mutableMapOf<String, Int>()
        starts.distinct().forEach { start ->
            if (start in depths) return@forEach
            depths[start] = 0
            val queue = ArrayDeque<String>().apply { add(start) }
            while (queue.isNotEmpty()) {
                val id = queue.removeFirst()
                constraints[id].orEmpty().sortedBy { it.first }.forEach { (next, offset) ->
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
        .distinctBy { it.id }.sortedWith(familyComparator)

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
        return TreeLayoutResult(nodes, relationships.sortedBy { it.id }.mapNotNull {
            val from = positions[it.fromPersonId] ?: return@mapNotNull null
            val to = positions[it.toPersonId] ?: return@mapNotNull null
            it.toLayout(from, to)
        })
    }

    private fun RelationshipSnapshot.toLayout(from: Point, to: Point) = TreeEdgeLayout(
        id, fromPersonId, toPersonId, from, to, kind, subtype, marriageYear,
    )

    private val familyComparator = compareBy<PersonSnapshot>(
        { when (it.gender) { PersonGender.MALE -> 0; PersonGender.FEMALE -> 1; PersonGender.UNSPECIFIED -> 2 } },
        { it.name.lowercase(Locale.ROOT) },
        { it.id },
    )
    private val chronologicalComparator = compareBy<PersonSnapshot> { it.birthEpochMillis == null }
        .thenBy { it.birthEpochMillis }
        .then(familyComparator)
}
