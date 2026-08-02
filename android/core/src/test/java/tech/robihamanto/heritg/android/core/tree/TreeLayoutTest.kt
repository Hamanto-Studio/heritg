package tech.robihamanto.heritg.android.core.tree

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import tech.robihamanto.heritg.android.core.domain.PersonSnapshot
import tech.robihamanto.heritg.android.core.domain.RelationshipSnapshot
import tech.robihamanto.heritg.android.core.model.PersonGender
import tech.robihamanto.heritg.android.core.model.RelationshipKind
import tech.robihamanto.heritg.android.core.model.RelationshipSubtype
import java.text.Collator
import java.util.Locale

class TreeLayoutTest {
    @Test fun generationLimitsAndConstantsMatchIos() {
        val ids = listOf("a2", "a1", "focus", "d1", "d2")
        val people = ids.map { PersonSnapshot(it, it, PersonGender.UNSPECIFIED) }
        val relationships = ids.zipWithNext().mapIndexed { index, pair ->
            RelationshipSnapshot("e$index", pair.first, pair.second, RelationshipKind.PARENT)
        }
        val layout = TreeLayout.make(
            null, people, relationships, "focus", TreeGenerationLimits(ancestorLevels = 1, descendantLevels = 1),
        )
        assertEquals(setOf("a1", "focus", "d1"), layout.nodes.map { it.id }.toSet())
        assertEquals(260.0, TreeVisualMetrics.HorizontalSpacing, 0.0)
        assertEquals(260.0, TreeVisualMetrics.GenerationSpacing, 0.0)
        assertEquals(32.0, TreeVisualMetrics.AvatarRadius, 0.0)
        assertEquals(190.0, TreeVisualMetrics.NodeLabelWidth, 0.0)
    }

    @Test fun routePlanningGroupsSiblingsAndIsDeterministic() {
        val nodes = listOf(
            node("a", -100.0, 0.0), node("b", 100.0, 0.0),
            node("c", -100.0, 260.0), node("d", 100.0, 260.0),
        )
        val edges = listOf("a" to "c", "b" to "c", "a" to "d", "b" to "d").mapIndexed { index, pair ->
            TreeEdgeLayout("e$index", pair.first, pair.second, nodePoint(nodes, pair.first), nodePoint(nodes, pair.second),
                RelationshipKind.PARENT, tech.robihamanto.heritg.android.core.model.RelationshipSubtype.BIOLOGICAL_PARENT)
        }
        val forward = TreeConnectionPlan.make(TreeLayoutResult(nodes, edges))
        val reversed = TreeConnectionPlan.make(TreeLayoutResult(nodes, edges.reversed()))
        assertEquals(1, forward.families.size)
        assertEquals(setOf("c", "d"), forward.families.single().childIds.toSet())
        assertEquals(forward, reversed)
        assertTrue(forward.families.single().junctions.size == 2)
    }

    @Test fun portableNameComparatorAndIdsMatchIosAcrossInputPermutations() {
        val people = listOf(
            person("focus", "Focus"),
            person("same-b", "Same", PersonGender.MALE),
            person("same-a", "Same", PersonGender.MALE),
            person("lower", "same", PersonGender.MALE),
            person("dotted", "İpek", PersonGender.MALE),
            person("dotless", "ıpek", PersonGender.MALE),
        )
        val relationships = people.drop(1).mapIndexed { index, value ->
            RelationshipSnapshot("r$index", value.id, "focus", RelationshipKind.PARENT)
        }

        val baseline = TreeLayout.make("focus", people, relationships)
        val permuted = TreeLayout.make("focus", people.reversed(), relationships.reversed())

        assertEquals(baseline.nodes.map { it.id to it.position }, permuted.nodes.map { it.id to it.position })
        assertEquals(baseline.edges.map { it.id }, permuted.edges.map { it.id })
        assertEquals(listOf("focus", "dotted", "same-a", "same-b", "lower", "dotless"), baseline.nodes.map { it.id })
    }

    @Test fun iosLocalePermutationFixtureKeepsCoordinatesAndRoutesStable() {
        val people = listOf(
            person("root", "Root"), person("parent-b", "Ipek", PersonGender.MALE),
            person("parent-a", "ipek", PersonGender.MALE), person("parent-c", "İpek", PersonGender.MALE),
            person("parent-d", "ıpek", PersonGender.MALE), person("child-b", "Same", birth = 200),
            person("child-a", "Same", birth = 200), person("partner", "Partner", birth = 100),
        )
        val relationships = listOf(
            parent("root", "parent-a", "r1"), parent("root", "parent-b", "r2"),
            parent("root", "parent-c", "r3"), parent("root", "parent-d", "r4"),
            parent("parent-a", "child-a", "r5"), parent("parent-b", "child-a", "r6"),
            parent("parent-a", "child-b", "r7"), parent("parent-b", "child-b", "r8"),
            partner("child-b", "partner", "r9"),
        )
        val englishPeople = localeOrder(people, Locale.US)
        val turkishPeople = localeOrder(people, Locale.forLanguageTag("tr-TR"))
        assertTrue(englishPeople.map { it.id } != turkishPeople.map { it.id })

        val baseline = TreeLayout.make(null, englishPeople, relationships, "child-a")
        val permuted = TreeLayout.make(null, turkishPeople, relationships.reversed(), "child-a")

        assertEquals(baseline.nodes.map { it.id to it.position }, permuted.nodes.map { it.id to it.position })
        assertEquals(baseline.edges.map { it.id }, permuted.edges.map { it.id })
        assertEquals(TreeConnectionPlan.make(baseline), TreeConnectionPlan.make(permuted))
    }

    @Test fun familyGroupsMultiParentAndPartnerComponentsLikeIos() {
        val people = listOf(
            person("focus", "Focus"), person("co", "Co-parent"),
            person("child-a", "A", birth = 200), person("child-b", "B", birth = 100),
            person("child-c", "C", birth = 50), person("partner-1", "P1", birth = 150),
            person("partner-2", "P2", birth = 125),
        )
        val relationships = listOf(
            parent("focus", "child-a", "a1"), parent("co", "child-a", "a2"),
            parent("focus", "child-b", "b1"), parent("co", "child-b", "b2"),
            parent("focus", "child-c", "c1"),
            partner("child-a", "partner-1", "p1"), partner("partner-1", "partner-2", "p2"),
        )

        val layout = TreeLayout.make(null, people, relationships)
        val childRow = layout.nodes.filter { it.position.y > 0 }.sortedBy { it.position.x }.map { it.id }

        assertEquals(listOf("child-c", "child-b", "child-a", "partner-2", "partner-1"), childRow)
    }

    @Test fun entireTreePlacesOldestChildOnTheLeft() {
        val people = listOf(
            person("parent", "Parent"),
            person("younger", "Younger", PersonGender.MALE, 200),
            person("older", "Older", PersonGender.FEMALE, 100),
        )
        val layout = TreeLayout.make(
            null,
            people,
            listOf(parent("parent", "younger", "younger-edge"), parent("parent", "older", "older-edge")),
        )

        assertTrue(layout.position("older").x < layout.position("younger").x)
    }

    @Test fun birthdayEditChangesLayoutWithoutChangingNodeIds() {
        val relationships = listOf(
            parent("parent", "first", "first-edge"),
            parent("parent", "second", "second-edge"),
        )
        val firstLayout = TreeLayout.make(
            null,
            listOf(person("parent", "Parent"), person("first", "First", birth = 100), person("second", "Second", birth = 200)),
            relationships,
        )
        val secondLayout = TreeLayout.make(
            null,
            listOf(person("parent", "Parent"), person("first", "First", birth = 300), person("second", "Second", birth = 200)),
            relationships,
        )

        assertEquals(firstLayout.nodes.map { it.id }.sorted(), secondLayout.nodes.map { it.id }.sorted())
        assertTrue(firstLayout.position("first").x < firstLayout.position("second").x)
        assertTrue(secondLayout.position("second").x < secondLayout.position("first").x)
    }

    @Test fun parentlessSpouseDoesNotSplitAnOrderedSiblingGroup() {
        val people = listOf(
            person("parent", "Parent"),
            person("older", "Older", PersonGender.FEMALE, 100),
            person("younger", "Younger", PersonGender.MALE, 200),
            person("spouse", "Spouse", birth = 50),
        )
        val relationships = listOf(
            parent("parent", "older", "older-edge"),
            parent("parent", "younger", "younger-edge"),
            partner("older", "spouse", "partner-edge"),
        )
        val layout = TreeLayout.make(null, people, relationships)

        assertTrue(layout.position("older").x < layout.position("younger").x)
        assertTrue(layout.position("younger").x < layout.position("spouse").x)
    }

    @Test fun differentParentSetsFormIndependentOrderedSiblingGroups() {
        val people = listOf(
            person("parent-a", "Parent A"), person("parent-b", "Parent B"),
            person("b-older", "B Older", birth = 200), person("a-younger", "A Younger", birth = 400),
            person("a-older", "A Older", birth = 100), person("b-younger", "B Younger", birth = 300),
        )
        val relationships = listOf(
            parent("parent-a", "a-younger", "a-younger-edge"),
            parent("parent-a", "a-older", "a-older-edge"),
            parent("parent-b", "b-younger", "b-younger-edge"),
            parent("parent-b", "b-older", "b-older-edge"),
        )
        val layout = TreeLayout.make(null, people, relationships)

        assertEquals(
            listOf("a-older", "a-younger", "b-older", "b-younger"),
            layout.row("a-older", "a-younger", "b-older", "b-younger"),
        )
        assertTrue(layout.position("a-younger").x < layout.position("b-older").x)
    }

    @Test fun overlappingParentSetsFollowTheLeftmostParentBeforeChildAge() {
        val people = listOf(
            person("a", "A"), person("b", "B"), person("c", "C"), person("d", "D"),
            person("bc-child", "BC Child", birth = 100), person("ad-child", "AD Child", birth = 200),
        )
        val relationships = listOf(
            parent("a", "ad-child", "a-ad"), parent("d", "ad-child", "d-ad"),
            parent("b", "bc-child", "b-bc"), parent("c", "bc-child", "c-bc"),
        )
        val layout = TreeLayout.make(null, people, relationships)

        assertEquals(listOf("ad-child", "bc-child"), layout.row("ad-child", "bc-child"))
    }

    @Test fun childrenStayGroupedByParentFamilyBeforeCrossFamilySpouses() {
        val people = listOf(
            person("yatmin", "Yatmin", PersonGender.MALE),
            person("binem", "Binem", PersonGender.FEMALE),
            person("djemangun", "Djemangun", PersonGender.MALE),
            person("mudjiati", "Mudjiati", PersonGender.FEMALE),
            person("sukamto", "Sukamto", PersonGender.MALE, 100),
            person("karno", "Karno", PersonGender.MALE, 200),
            person("fadmudikah", "Fadmudikah", PersonGender.FEMALE, 150),
        )
        val relationships = listOf(
            partner("yatmin", "binem", "yb", RelationshipSubtype.SPOUSE),
            partner("djemangun", "mudjiati", "dm", RelationshipSubtype.SPOUSE),
            parent("yatmin", "sukamto", "ys"), parent("binem", "sukamto", "bs"),
            parent("yatmin", "karno", "yk"), parent("binem", "karno", "bk"),
            parent("djemangun", "fadmudikah", "df"), parent("mudjiati", "fadmudikah", "mf"),
            partner("sukamto", "fadmudikah", "sf", RelationshipSubtype.SPOUSE),
        )
        val layout = TreeLayout.make(null, people, relationships)

        assertEquals(listOf("sukamto", "karno", "fadmudikah"), layout.row("sukamto", "karno", "fadmudikah"))
        assertEquals(-TreeVisualMetrics.HorizontalSpacing, layout.position("sukamto").x, 0.0)
        assertEquals(0.0, layout.position("karno").x, 0.0)
        assertEquals(TreeVisualMetrics.HorizontalSpacing, layout.position("fadmudikah").x, 0.0)
    }

    @Test fun disconnectedComponentsAndParentCyclesAreStable() {
        val people = listOf("cycle-b", "partner-z", "root", "cycle-a", "partner-a").map {
            person(it, it)
        }
        val relationships = listOf(
            parent("cycle-b", "cycle-a", "z-parent"),
            parent("cycle-a", "cycle-b", "a-parent"),
            partner("partner-z", "partner-a", "partner"),
        )

        val baseline = TreeLayout.make(null, people, relationships)
        val permuted = TreeLayout.make(null, people, relationships.reversed())

        assertEquals(baseline.nodes.map { it.id to it.position }, permuted.nodes.map { it.id to it.position })
        assertEquals(baseline.edges.map { it.id }, permuted.edges.map { it.id })
    }

    private fun node(id: String, x: Double, y: Double) = TreeNodeLayout(
        id, PersonSnapshot(id, id, PersonGender.UNSPECIFIED), "Family member", Point(x, y),
    )
    private fun nodePoint(nodes: List<TreeNodeLayout>, id: String) = nodes.first { it.id == id }.position
    private fun person(
        id: String,
        name: String,
        gender: PersonGender = PersonGender.UNSPECIFIED,
        birth: Long? = null,
    ) = PersonSnapshot(id, name, gender, birthEpochMillis = birth)
    private fun parent(from: String, to: String, id: String) =
        RelationshipSnapshot(id, from, to, RelationshipKind.PARENT)
    private fun partner(
        from: String,
        to: String,
        id: String,
        subtype: RelationshipSubtype = RelationshipSubtype.PARTNER,
    ) = RelationshipSnapshot(id, from, to, RelationshipKind.PARTNER, subtype)
    private fun TreeLayoutResult.position(id: String) = nodes.first { it.id == id }.position
    private fun TreeLayoutResult.row(vararg ids: String): List<String> = nodes
        .filter { it.id in ids }
        .sortedBy { it.position.x }
        .map { it.id }
    private fun localeOrder(people: List<PersonSnapshot>, locale: Locale): List<PersonSnapshot> {
        val collator = Collator.getInstance(locale).apply { strength = Collator.SECONDARY }
        return people.sortedWith { first, second ->
            collator.compare(first.name, second.name).takeIf { it != 0 } ?: first.id.compareTo(second.id)
        }
    }
}
