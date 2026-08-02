package tech.robihamanto.heritg.android.core.interop

import org.junit.Test
import tech.robihamanto.heritg.android.core.domain.FamilyGraph
import tech.robihamanto.heritg.android.core.model.BirthDatePrecision
import tech.robihamanto.heritg.android.core.model.FamilyRelationship
import tech.robihamanto.heritg.android.core.model.FamilyTree
import tech.robihamanto.heritg.android.core.model.Person
import tech.robihamanto.heritg.android.core.model.RelationshipKind
import tech.robihamanto.heritg.android.core.model.RelationshipSubtype
import java.time.Instant

class ValidationPerformanceTest {
    @Test(timeout = 8_000)
    fun familyGraphValidationScalesWithRecordsRatherThanEndpointListScans() {
        val fixture = fixture(12_000)

        FamilyGraph.validate(fixture.tree, fixture.people, fixture.relationships)
    }

    @Test(timeout = 8_000)
    fun archiveRecordValidationScalesWithIndexedPersonIds() {
        val fixture = fixture(8_000)
        val timestamp = "1970-01-01T00:00:00.000Z"
        val people = fixture.people.map {
            PersonRecord(
                addressLine = "", birthDatePrecision = BirthDatePrecision.EXACT.wireName,
                city = "", country = "", createdAt = timestamp, displayName = it.displayName,
                gender = it.gender.wireName, id = it.id, notes = "", postalCode = "", province = "",
                schemaVersion = ArchiveConstants.SchemaVersion, treeId = fixture.tree.id,
            )
        }
        val relationships = fixture.relationships.map {
            RelationshipRecord(
                createdAt = timestamp, fromPersonId = it.fromPersonId, id = it.id,
                kind = it.kind.wireName, schemaVersion = ArchiveConstants.SchemaVersion,
                subtype = it.subtype.wireName, toPersonId = it.toPersonId, treeId = fixture.tree.id,
            )
        }

        ArchiveValidation.validateRecords(
            ArchiveManifest(
                ArchiveCounts(0, people.size, relationships.size), timestamp, ArchiveConstants.Format,
                ArchiveConstants.FormatVersion, ArchiveConstants.HashAlgorithm,
                ArchiveConstants.SchemaVersion, fixture.tree.id,
            ),
            TreeRecord(timestamp, fixture.tree.id, null, ArchiveConstants.SchemaVersion, fixture.tree.title, timestamp),
            people,
            relationships,
            emptyMap(),
        )
    }

    private fun fixture(size: Int): Fixture {
        val tree = FamilyTree("performance-tree", "Synthetic", Instant.EPOCH, Instant.EPOCH)
        val people = List(size) { index ->
            Person("person-$index", tree.id, "Person $index", createdAt = Instant.EPOCH)
        }
        val relationships = (0 until size - 3).flatMap { from ->
            (1..3).map { offset ->
                FamilyRelationship(
                    id = "relationship-$from-$offset", treeId = tree.id,
                    fromPersonId = people[from].id, toPersonId = people[from + offset].id,
                    kind = RelationshipKind.PARENT, subtype = RelationshipSubtype.BIOLOGICAL_PARENT,
                    createdAt = Instant.EPOCH,
                )
            }
        }
        return Fixture(tree, people, relationships)
    }

    private data class Fixture(
        val tree: FamilyTree,
        val people: List<Person>,
        val relationships: List<FamilyRelationship>,
    )
}
