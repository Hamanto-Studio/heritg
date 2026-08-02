package tech.robihamanto.heritg.android.core.data

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import tech.robihamanto.heritg.android.core.domain.RelativeRole
import tech.robihamanto.heritg.android.core.domain.relativeRoleFor
import tech.robihamanto.heritg.android.core.interop.ArchiveException
import tech.robihamanto.heritg.android.core.interop.ArchivePayload
import tech.robihamanto.heritg.android.core.model.FamilyRelationship
import tech.robihamanto.heritg.android.core.model.FamilyTree
import tech.robihamanto.heritg.android.core.model.PersonDetails
import tech.robihamanto.heritg.android.core.model.PersonGender
import tech.robihamanto.heritg.android.core.model.RelationshipKind
import tech.robihamanto.heritg.android.core.model.RelationshipSubtype
import java.time.Instant

@RunWith(AndroidJUnit4::class)
class FamilyRepositoryTest {
    private lateinit var database: HeritgDatabase
    private lateinit var repository: FamilyRepository

    @Before
    fun setUp() {
        database = Room.inMemoryDatabaseBuilder(
            ApplicationProvider.getApplicationContext(),
            HeritgDatabase::class.java,
        ).allowMainThreadQueries().build()
        repository = FamilyRepository(database)
    }

    @After
    fun tearDown() = database.close()

    @Test
    fun treeStatePersistsSelectionAndDeleteCascades() = runTest {
        val tree = repository.createTree("My Family Tree")
        val rina = repository.createPerson(tree.id, "Rina")
        repository.addRelative(rina.id, "Budi", RelativeRole.FATHER)
        repository.rememberSelectedPerson(tree.id, rina.id)

        val state = repository.observeTree(tree.id).first { it.people.size == 2 }
        assertEquals(rina.id, state.tree?.lastSelectedPersonId)
        assertEquals(1, state.relationships.size)
        assertEquals(2 to 1, repository.treeCounts(tree.id))

        repository.deleteTree(tree.id)
        assertEquals(0, repository.observeTreeCount().first())
        assertNull(database.familyDao().person(rina.id))
    }

    @Test
    fun rejectsCrossTreeLinkWithoutPartialWrite() = runTest {
        val first = repository.createTree("First")
        val second = repository.createTree("Second")
        val one = repository.createPerson(first.id, "One")
        val two = repository.createPerson(second.id, "Two")

        runCatching { repository.link(one.id, two.id, RelativeRole.PARTNER) }

        assertEquals(0, repository.treeCounts(first.id).second)
        assertEquals(0, repository.treeCounts(second.id).second)
    }

    @Test
    fun genderedLinkInfersGenderOnlyWhenRelativeIsUnspecified() = runTest {
        val tree = repository.createTree("Family")
        val person = repository.createPerson(tree.id, "Child")
        val relative = repository.createPerson(tree.id, "Parent")

        val relationship = repository.link(person.id, relative.id, RelativeRole.MOTHER)
        val savedRelative = repository.observePeople(tree.id).first().first { it.id == relative.id }

        assertEquals(PersonGender.FEMALE, savedRelative.gender)
        assertEquals(RelativeRole.MOTHER, relativeRoleFor(relationship, savedRelative, person.id))
    }

    @Test
    fun focusDoesNotReorderTreeAndDeletingFocusedPersonPersistsFallback() = runTest {
        val tree = repository.createTree("Family")
        val first = repository.createPerson(tree.id, "First")
        val second = repository.createPerson(tree.id, "Second")
        val beforeFocus = database.familyDao().tree(tree.id)!!.updatedAtEpochMillis

        repository.rememberSelectedPerson(tree.id, second.id)
        assertEquals(beforeFocus, database.familyDao().tree(tree.id)!!.updatedAtEpochMillis)
        assertEquals(first.id, repository.deletePerson(second.id))
        assertEquals(first.id, database.familyDao().tree(tree.id)!!.lastSelectedPersonId)
    }

    @Test
    fun invalidStagedRelationshipEditRollsBackPersonFields() = runTest {
        val tree = repository.createTree("Family")
        val person = repository.createPerson(tree.id, "Original")

        runCatching {
            repository.savePersonEdits(
                person.id, "Changed", person.gender, PersonDetails(), setOf("missing"), emptyList(),
            )
        }

        assertEquals("Original", database.familyDao().person(person.id)?.displayName)
    }

    @Test
    fun stagedParentEditPreservesDirectionFromChildPerspective() = runTest {
        val tree = repository.createTree("Family")
        val parent = repository.createPerson(tree.id, "Parent")
        val child = repository.addRelative(parent.id, "Child", RelativeRole.FOSTER_DAUGHTER)
        val original = repository.observeRelationships(tree.id).first().single()
        val parentRole = relativeRoleFor(original, parent, child.id)

        repository.savePersonEdits(
            child.id, child.displayName, child.gender, PersonDetails(), setOf(original.id),
            listOf(StagedRelationshipLink(parent.id, parentRole, null, inferGender = false)),
        )

        val saved = repository.observeRelationships(tree.id).first().single()
        assertEquals(parent.id, saved.fromPersonId)
        assertEquals(child.id, saved.toPersonId)
        assertEquals(original.subtype, saved.subtype)
    }

    @Test
    fun stagedRelationshipInfersGenderOnlyWhenRoleWasExplicitlySelected() = runTest {
        val tree = repository.createTree("Family")
        val person = repository.createPerson(tree.id, "Person")
        val relative = repository.createPerson(tree.id, "Relative")
        val original = repository.link(person.id, relative.id, RelativeRole.PARTNER)

        repository.savePersonEdits(
            person.id, person.displayName, person.gender, PersonDetails(), setOf(original.id),
            listOf(StagedRelationshipLink(relative.id, RelativeRole.HUSBAND, null, inferGender = false)),
        )
        assertEquals(
            PersonGender.UNSPECIFIED,
            repository.observePeople(tree.id).first().first { it.id == relative.id }.gender,
        )

        val replacement = repository.observeRelationships(tree.id).first().single()
        repository.savePersonEdits(
            person.id, person.displayName, person.gender, PersonDetails(), setOf(replacement.id),
            listOf(StagedRelationshipLink(relative.id, RelativeRole.HUSBAND, null, inferGender = true)),
        )
        assertEquals(
            PersonGender.MALE,
            repository.observePeople(tree.id).first().first { it.id == relative.id }.gender,
        )
    }

    @Test
    fun genderInferenceBelongsToItsSpecificStagedRelationship() = runTest {
        val tree = repository.createTree("Family")
        val person = repository.createPerson(tree.id, "Person")
        val relative = repository.createPerson(tree.id, "Relative")
        val partner = repository.link(person.id, relative.id, RelativeRole.PARTNER)
        val endpoints = listOf(person.id, relative.id).sorted()
        val sibling = FamilyRelationship(
            id = "sibling",
            treeId = tree.id,
            fromPersonId = endpoints[0],
            toPersonId = endpoints[1],
            kind = RelationshipKind.SIBLING,
            subtype = RelationshipSubtype.SIBLING,
            createdAt = Instant.EPOCH,
        )
        database.familyDao().insertRelationships(listOf(sibling.toEntity()))

        repository.savePersonEdits(
            person.id, person.displayName, person.gender, PersonDetails(), setOf(partner.id, sibling.id),
            listOf(
                StagedRelationshipLink(relative.id, RelativeRole.HUSBAND, null, inferGender = false),
                StagedRelationshipLink(relative.id, RelativeRole.SISTER, null, inferGender = true),
            ),
        )

        assertEquals(
            PersonGender.FEMALE,
            repository.observePeople(tree.id).first().first { it.id == relative.id }.gender,
        )
    }

    @Test
    fun conflictingExplicitGenderRolesAreRejectedWithoutPartialWrites() = runTest {
        val tree = repository.createTree("Family")
        val person = repository.createPerson(tree.id, "Person")
        val relative = repository.createPerson(tree.id, "Relative")
        val partner = repository.link(person.id, relative.id, RelativeRole.PARTNER)
        val endpoints = listOf(person.id, relative.id).sorted()
        val sibling = FamilyRelationship(
            id = "sibling",
            treeId = tree.id,
            fromPersonId = endpoints[0],
            toPersonId = endpoints[1],
            kind = RelationshipKind.SIBLING,
            subtype = RelationshipSubtype.SIBLING,
            createdAt = Instant.EPOCH,
        )
        database.familyDao().insertRelationships(listOf(sibling.toEntity()))

        val error = runCatching {
            repository.savePersonEdits(
                person.id, person.displayName, person.gender, PersonDetails(), setOf(partner.id, sibling.id),
                listOf(
                    StagedRelationshipLink(relative.id, RelativeRole.HUSBAND, null, inferGender = true),
                    StagedRelationshipLink(relative.id, RelativeRole.SISTER, null, inferGender = true),
                ),
            )
        }.exceptionOrNull()

        assertTrue(error is tech.robihamanto.heritg.android.core.domain.FamilyGraphException.InvalidGraph)
        assertEquals(
            PersonGender.UNSPECIFIED,
            repository.observePeople(tree.id).first().first { it.id == relative.id }.gender,
        )
        assertEquals(setOf(partner.id, sibling.id), repository.observeRelationships(tree.id).first().mapTo(mutableSetOf()) { it.id })
    }

    @Test
    fun importDetectsBatchedPersonCollisionWithoutPartialWrite() = runTest {
        val existingTree = repository.createTree("Existing")
        val existingPerson = repository.createPerson(existingTree.id, "Existing person")
        val importedTree = FamilyTree(id = "imported", title = "Imported", createdAt = Instant.EPOCH,
            updatedAt = Instant.EPOCH)
        val payload = ArchivePayload(
            exportedAt = Instant.EPOCH,
            tree = importedTree,
            people = listOf(existingPerson.copy(treeId = importedTree.id)),
            relationships = emptyList(),
        )

        val error = runCatching { repository.importPayload(payload) }.exceptionOrNull()

        assertTrue(error is ArchiveException.IdentifierCollision)
        assertNull(database.familyDao().tree(importedTree.id))
        assertEquals(1, repository.observeTreeCount().first())
    }
}
