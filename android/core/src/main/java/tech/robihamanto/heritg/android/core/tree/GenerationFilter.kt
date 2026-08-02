package tech.robihamanto.heritg.android.core.tree

import tech.robihamanto.heritg.android.core.domain.RelationshipSnapshot
import tech.robihamanto.heritg.android.core.model.RelationshipKind

data class TreeGenerationLimits(
    val ancestorLevels: Int? = null,
    val descendantLevels: Int? = null,
) {
    val isUnlimited: Boolean get() = ancestorLevels == null && descendantLevels == null

    fun clamped(available: AvailableGenerationLevels) = TreeGenerationLimits(
        ancestorLevels = ancestorLevels.clamp(available.ancestorLevels),
        descendantLevels = descendantLevels.clamp(available.descendantLevels),
    )

    private fun Int?.clamp(maximum: Int): Int? =
        if (maximum <= 0) null else this?.coerceIn(0, maximum)
}

data class AvailableGenerationLevels(val ancestorLevels: Int, val descendantLevels: Int) {
    val hasAny: Boolean get() = ancestorLevels > 0 || descendantLevels > 0

    companion object { val None = AvailableGenerationLevels(0, 0) }
}

object GenerationFilter {
    fun availableLevels(
        selectedPersonId: String?,
        validPersonIds: Set<String>,
        relationships: Collection<RelationshipSnapshot>,
        depths: Map<String, Int>,
    ): AvailableGenerationLevels {
        val levels = relativeLevels(selectedPersonId, validPersonIds, relationships, depths)
            ?: return AvailableGenerationLevels.None
        return AvailableGenerationLevels(
            ancestorLevels = maxOf(0, -(levels.values.minOrNull() ?: 0)),
            descendantLevels = maxOf(0, levels.values.maxOrNull() ?: 0),
        )
    }

    fun visiblePersonIds(
        selectedPersonId: String?,
        validPersonIds: Set<String>,
        relationships: Collection<RelationshipSnapshot>,
        depths: Map<String, Int>,
        limits: TreeGenerationLimits,
    ): Set<String> {
        if (limits.isUnlimited) return validPersonIds
        val levels = relativeLevels(selectedPersonId, validPersonIds, relationships, depths)
            ?: return validPersonIds
        return levels.mapNotNullTo(mutableSetOf()) { (id, level) ->
            when {
                level < 0 && limits.ancestorLevels != null -> id.takeIf { -level <= maxOf(limits.ancestorLevels, 0) }
                level > 0 && limits.descendantLevels != null -> id.takeIf { level <= maxOf(limits.descendantLevels, 0) }
                else -> id
            }
        }
    }

    fun layoutLevels(
        selectedPersonId: String?,
        validPersonIds: Set<String>,
        relationships: Collection<RelationshipSnapshot>,
        depths: Map<String, Int>,
        limits: TreeGenerationLimits,
    ): Map<String, Int> {
        if (limits.isUnlimited) return depths
        val relative = relativeLevels(selectedPersonId, validPersonIds, relationships, depths) ?: return depths
        return depths + relative
    }

    private fun relativeLevels(
        selectedPersonId: String?,
        validPersonIds: Set<String>,
        relationships: Collection<RelationshipSnapshot>,
        depths: Map<String, Int>,
    ): Map<String, Int>? {
        val selected = selectedPersonId?.takeIf { it in validPersonIds } ?: return null
        val selectedDepth = depths[selected] ?: return null
        val adjacency = adjacency(validPersonIds, relationships)
        val connected = connectedIds(selected, adjacency.all)
        val ancestors = parentDistances(selected, adjacency.parents)
        val descendants = parentDistances(selected, adjacency.children)
        return connected.associateWith { id ->
            val fallback = (depths[id] ?: selectedDepth) - selectedDepth
            val up = ancestors[id]
            val down = descendants[id]
            when {
                up != null && down != null && up < down -> -up
                up != null && down != null && down < up -> down
                up != null && down != null -> if (fallback < 0) -up else down
                up != null -> -up
                down != null -> down
                else -> fallback
            }
        }
    }

    private fun parentDistances(
        start: String,
        adjacent: Map<String, List<String>>,
    ): Map<String, Int> {
        val result = mutableMapOf<String, Int>()
        val queue = ArrayDeque<Pair<String, Int>>().apply { add(start to 0) }
        while (queue.isNotEmpty()) {
            val (id, distance) = queue.removeFirst()
            adjacent[id].orEmpty().forEach { next ->
                if (next != start && next !in result) {
                    result[next] = distance + 1
                    queue.add(next to distance + 1)
                }
            }
        }
        return result
    }

    private fun connectedIds(
        start: String,
        adjacent: Map<String, List<String>>,
    ): Set<String> {
        val result = mutableSetOf(start)
        val queue = ArrayDeque<String>().apply { add(start) }
        while (queue.isNotEmpty()) adjacent[queue.removeFirst()].orEmpty().forEach {
            if (result.add(it)) queue.add(it)
        }
        return result
    }

    private fun adjacency(
        validIds: Set<String>,
        relationships: Collection<RelationshipSnapshot>,
    ): Adjacency {
        val all = mutableMapOf<String, MutableSet<String>>()
        val parents = mutableMapOf<String, MutableSet<String>>()
        val children = mutableMapOf<String, MutableSet<String>>()
        relationships.forEach { relationship ->
            val from = relationship.fromPersonId
            val to = relationship.toPersonId
            if (from !in validIds || to !in validIds || from == to) return@forEach
            all.getOrPut(from, ::mutableSetOf).add(to)
            all.getOrPut(to, ::mutableSetOf).add(from)
            if (relationship.kind == RelationshipKind.PARENT) {
                parents.getOrPut(to, ::mutableSetOf).add(from)
                children.getOrPut(from, ::mutableSetOf).add(to)
            }
        }
        fun sorted(values: Map<String, Set<String>>) = values.mapValues { it.value.sorted() }
        return Adjacency(sorted(all), sorted(parents), sorted(children))
    }

    private data class Adjacency(
        val all: Map<String, List<String>>,
        val parents: Map<String, List<String>>,
        val children: Map<String, List<String>>,
    )
}
