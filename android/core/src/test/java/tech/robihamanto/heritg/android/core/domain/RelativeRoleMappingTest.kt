package tech.robihamanto.heritg.android.core.domain

import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized
import tech.robihamanto.heritg.android.core.model.FamilyRelationship
import tech.robihamanto.heritg.android.core.model.Person

@RunWith(Parameterized::class)
class RelativeRoleMappingTest(private val role: RelativeRole) {
    @Test
    fun storedRelationshipRoundTripsFromTheFocusedPersonsPerspective() {
        val focus = Person(id = "focus", treeId = "tree", displayName = "Focus")
        val relative = Person(id = "relative", treeId = "tree", displayName = "Relative", gender = role.gender)
        val endpoints = relationshipEndpoints(focus.id, relative.id, role)
        val relationship = FamilyRelationship(
            treeId = "tree",
            fromPersonId = endpoints.fromPersonId,
            toPersonId = endpoints.toPersonId,
            kind = endpoints.kind,
            subtype = endpoints.subtype,
        )

        assertEquals(role, relativeRoleFor(relationship, relative, focus.id))
    }

    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun roles(): List<Array<RelativeRole>> = RelativeRole.entries.map { arrayOf(it) }
    }
}
