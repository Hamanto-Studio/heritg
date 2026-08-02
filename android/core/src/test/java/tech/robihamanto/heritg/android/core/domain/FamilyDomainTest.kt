package tech.robihamanto.heritg.android.core.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import tech.robihamanto.heritg.android.core.model.FamilyRelationship
import tech.robihamanto.heritg.android.core.model.FamilyTree
import tech.robihamanto.heritg.android.core.model.Person
import tech.robihamanto.heritg.android.core.model.PersonDetails
import tech.robihamanto.heritg.android.core.model.RelationshipKind
import tech.robihamanto.heritg.android.core.model.RelationshipSubtype
import java.time.Instant
import java.time.ZoneOffset

class FamilyDomainTest {
    @Test fun allThirtyFourRelativeRolesHaveExactEndpointSemantics() {
        assertEquals(34, RelativeRole.entries.size)
        RelativeRole.entries.forEach { role ->
            val endpoint = relationshipEndpoints("focus", "relative", role)
            assertEquals(role.kind, endpoint.kind)
            assertEquals(role.subtype, endpoint.subtype)
            when {
                role.relativeIsParent -> assertEquals("relative" to "focus", endpoint.fromPersonId to endpoint.toPersonId)
                role.kind == RelationshipKind.PARENT -> assertEquals("focus" to "relative", endpoint.fromPersonId to endpoint.toPersonId)
                else -> assertEquals("focus" to "relative", endpoint.fromPersonId to endpoint.toPersonId)
            }
        }
    }

    @Test fun symmetricEndpointsAreCanonicalButParentDirectionIsPreserved() {
        assertEquals("a" to "z", canonicalEndpoints(RelationshipKind.PARTNER, "z", "a"))
        assertEquals("z" to "a", canonicalEndpoints(RelationshipKind.PARENT, "z", "a"))
    }

    @Test fun validationRejectsDuplicateReversedUnionAndDeathBeforeBirth() {
        val tree = FamilyTree(id = "tree", title = "Family")
        val first = Person(id = "a", treeId = tree.id, displayName = "A")
        val second = Person(id = "b", treeId = tree.id, displayName = "B")
        val relationship = FamilyRelationship(
            id = "r1", treeId = tree.id, fromPersonId = "a", toPersonId = "b",
            kind = RelationshipKind.PARTNER,
        )
        val reversed = relationship.copy(id = "r2", fromPersonId = "b", toPersonId = "a")
        FamilyGraph.validate(tree, listOf(first, second), listOf(reversed))
        assertThrows(FamilyGraphException.DuplicateRelationship::class.java) {
            FamilyGraph.validate(tree, listOf(first, second), listOf(relationship, reversed))
        }
        assertThrows(FamilyGraphException.DeathBeforeBirth::class.java) {
            FamilyGraph.normalizedDetails(PersonDetails(
                birthDate = Instant.parse("2000-01-01T00:00:00Z"),
                deathDate = Instant.parse("1999-12-31T00:00:00Z"),
            ))
        }
    }

    @Test fun coParentMustBeAnActivePartnerAndRoleMustAllowIt() {
        val focus = Person(id = "focus", treeId = "tree", displayName = "Focus")
        val partner = Person(id = "partner", treeId = "tree", displayName = "Partner")
        fun relationship(subtype: RelationshipSubtype) = FamilyRelationship(
            treeId = "tree", fromPersonId = "focus", toPersonId = "partner",
            kind = RelationshipKind.PARTNER, subtype = subtype,
        )
        assertTrue(FamilyGraph.isValidCoParent(focus, partner, RelativeRole.SON, listOf(relationship(RelationshipSubtype.SPOUSE))))
        assertFalse(FamilyGraph.isValidCoParent(focus, partner, RelativeRole.SON, listOf(relationship(RelationshipSubtype.FORMER_PARTNER))))
        assertFalse(FamilyGraph.isValidCoParent(focus, partner, RelativeRole.STEPSON, listOf(relationship(RelationshipSubtype.SPOUSE))))
    }

    @Test fun lifeSummariesMatchIosAndExposeIndonesianSemantics() {
        val person = Person(
            treeId = "tree",
            displayName = "Sukarno",
            birthDate = Instant.parse("1943-06-01T00:00:00Z"),
            deathDate = Instant.parse("2001-05-31T00:00:00Z"),
        )
        assertEquals(57, person.age(zoneId = ZoneOffset.UTC))
        assertEquals("Sukarno (57) (1943-2001)", LifeSummary.displayNameWithAge(person, zoneId = ZoneOffset.UTC))
        assertEquals("1943-2001 · age 57", LifeSummary.summary(person, EnglishSemanticFormatter, zoneId = ZoneOffset.UTC))
        assertEquals("1943-2001 · usia 57", LifeSummary.summary(person, IndonesianSemanticFormatter, zoneId = ZoneOffset.UTC))
        assertEquals("Ibu", IndonesianSemanticFormatter.text("Mother"))
    }
}
