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
        val connected = connectedIds(selected, validPersonIds, relationships)
        val ancestors = parentDistances(selected, validPersonIds, relationships, true)
        val descendants = parentDistances(selected, validPersonIds, relationships, false)
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
        validIds: Set<String>,
        relationships: Collection<RelationshipSnapshot>,
        followsParents: Boolean,
    ): Map<String, Int> {
        val result = mutableMapOf<String, Int>()
        val queue = ArrayDeque<Pair<String, Int>>().apply { add(start to 0) }
        while (queue.isNotEmpty()) {
            val (id, distance) = queue.removeFirst()
            relationships.asSequence().filter { it.kind == RelationshipKind.PARENT }.mapNotNull {
                when {
                    followsParents && it.toPersonId == id -> it.fromPersonId
                    !followsParents && it.fromPersonId == id -> it.toPersonId
                    else -> null
                }
            }.filter { it in validIds && it != start && it !in result }.forEach {
                result[it] = distance + 1
                queue.add(it to distance + 1)
            }
        }
        return result
    }

    private fun connectedIds(
        start: String,
        validIds: Set<String>,
        relationships: Collection<RelationshipSnapshot>,
    ): Set<String> {
        val adjacent = mutableMapOf<String, MutableSet<String>>()
        relationships.forEach {
            if (it.fromPersonId in validIds && it.toPersonId in validIds && it.fromPersonId != it.toPersonId) {
                adjacent.getOrPut(it.fromPersonId, ::mutableSetOf).add(it.toPersonId)
                adjacent.getOrPut(it.toPersonId, ::mutableSetOf).add(it.fromPersonId)
            }
        }
        val result = mutableSetOf(start)
        val queue = ArrayDeque<String>().apply { add(start) }
        while (queue.isNotEmpty()) adjacent[queue.removeFirst()].orEmpty().sorted().forEach {
            if (result.add(it)) queue.add(it)
        }
        return result
    }
}
