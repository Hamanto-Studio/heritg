package tech.robihamanto.heritg.android.core.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import tech.robihamanto.heritg.android.core.model.PersonGender
import tech.robihamanto.heritg.android.core.model.RelationshipKind
import tech.robihamanto.heritg.android.core.model.RelationshipSubtype
import java.util.Locale

class KinshipResolverTest {
    @Test fun resolvesCareSiblingAndInLawLabels() {
        val people = listOf(
            person("focus"), person("spouse"), person("mother", PersonGender.FEMALE),
            person("foster", PersonGender.MALE), person("half", PersonGender.FEMALE),
        )
        val relationships = listOf(
            relation("focus", "spouse", RelationshipKind.PARTNER, RelationshipSubtype.SPOUSE),
            relation("mother", "spouse", RelationshipKind.PARENT, RelationshipSubtype.BIOLOGICAL_PARENT),
            relation("focus", "foster", RelationshipKind.PARENT, RelationshipSubtype.FOSTER_PARENT),
            relation("focus", "half", RelationshipKind.SIBLING, RelationshipSubtype.HALF_SIBLING),
        )
        assertEquals("Mother-in-law", label("mother", people, relationships))
        assertEquals("Foster son", label("foster", people, relationships))
        assertEquals("Half-sister", label("half", people, relationships))
    }

    @Test fun adoptionContributesToCousinsButFosterCareDoesNot() {
        val ids = listOf("grand", "left", "right", "focus", "adopted", "foster")
        val people = ids.map(::person)
        val relationships = listOf(
            parent("grand", "left"), parent("grand", "right"), parent("left", "focus"),
            parent("right", "adopted", RelationshipSubtype.ADOPTIVE_PARENT),
            parent("right", "foster", RelationshipSubtype.FOSTER_PARENT),
        )
        assertEquals("First cousin", label("adopted", people, relationships))
        assertNull(label("foster", people, relationships))
    }

    @Test fun resolvesCousinDegreeAndRemoval() {
        val ids = listOf("ancestor", "lg", "lp", "focus", "rg", "rp", "cousin", "child")
        val people = ids.map(::person)
        val relationships = listOf(
            parent("ancestor", "lg"), parent("lg", "lp"), parent("lp", "focus"),
            parent("ancestor", "rg"), parent("rg", "rp"), parent("rp", "cousin"), parent("cousin", "child"),
        )
        assertEquals("Second cousin", label("cousin", people, relationships))
        assertEquals("Second cousin once removed", label("child", people, relationships))
    }

    @Test fun indonesianFormatterCoversDirectLineageAndInLaws() {
        val people = listOf(
            person("focus"), person("spouse"), person("mother", PersonGender.FEMALE),
            person("parent"), person("grand", PersonGender.MALE),
        )
        val relationships = listOf(
            relation("focus", "spouse", RelationshipKind.PARTNER, RelationshipSubtype.SPOUSE),
            parent("mother", "spouse"), parent("grand", "parent"), parent("parent", "focus"),
        )
        val formatter = semanticFormatter(Locale.forLanguageTag("id-ID"))

        assertEquals("Ibu mertua", KinshipResolver.label("mother", "focus", people, relationships, formatter))
        assertEquals("Kakek", KinshipResolver.label("grand", "focus", people, relationships, formatter))
    }

    @Test fun semanticHookReceivesLocaleAndFallsBackToAppFormatter() {
        val locale = Locale.forLanguageTag("id-ID")
        val formatter = semanticFormatter(locale) { received, key, _ ->
            if (key == "Mother") "Custom ${received.toLanguageTag()}" else null
        }

        assertEquals("Custom id-ID", formatter.text("Mother"))
        assertEquals("Ayah", formatter.text("Father"))
    }

    private fun person(id: String, gender: PersonGender = PersonGender.UNSPECIFIED) = PersonSnapshot(id, id, gender)
    private fun parent(from: String, to: String, subtype: RelationshipSubtype = RelationshipSubtype.BIOLOGICAL_PARENT) =
        relation(from, to, RelationshipKind.PARENT, subtype)
    private fun relation(from: String, to: String, kind: RelationshipKind, subtype: RelationshipSubtype) =
        RelationshipSnapshot("$kind-$from-$to", from, to, kind, subtype)
    private fun label(id: String, people: List<PersonSnapshot>, relationships: List<RelationshipSnapshot>) =
        KinshipResolver.label(id, "focus", people, relationships)
}
