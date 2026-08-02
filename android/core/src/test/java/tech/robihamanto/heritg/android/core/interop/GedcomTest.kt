package tech.robihamanto.heritg.android.core.interop

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import tech.robihamanto.heritg.android.core.model.FamilyRelationship
import tech.robihamanto.heritg.android.core.model.Person
import tech.robihamanto.heritg.android.core.model.PersonGender
import tech.robihamanto.heritg.android.core.model.RelationshipKind
import tech.robihamanto.heritg.android.core.model.RelationshipSubtype
import java.time.Instant

class GedcomTest {
    @Test
    fun importsIosSubsetDatesPedigreeMarriageNotesAndWarnings() {
        val source = """
            0 HEAD
            1 GEDC
            2 VERS 7.0
            0 @I1@ INDI
            1 NAME Rina /Putri/
            1 SEX F
            1 BIRT
            2 DATE ABT 1980
            2 PLAC Jakarta
            1 ADDR
            2 CITY Bandung
            1 NOTE First line
            2 CONT Second line
            0 @I2@ INDI
            1 NAME Budi /Putra/
            1 SEX M
            0 @I3@ INDI
            1 NAME Nadia
            0 @F1@ FAM
            1 HUSB @I2@
            1 WIFE @I1@
            1 CHIL @I3@
            2 PEDI adopted
            1 MARR
            2 DATE 3 JUN 2000
            0 TRLR
        """.trimIndent().encodeToByteArray()

        val result = GedcomImporter.parse(source, "Rina Family.ged")

        assertEquals("Rina Family", result.suggestedTitle)
        assertEquals(3, result.people.size)
        assertEquals("Rina Putri", result.people[0].name)
        assertEquals(PersonGender.FEMALE, result.people[0].gender)
        assertEquals("Bandung", result.people[0].city)
        assertEquals("First line\nSecond line", result.people[0].notes)
        assertEquals(1, result.warnings.size)
        assertTrue(
            result.relationships.toString(),
            result.relationships.any { it.kind == RelationshipKind.PARTNER && it.marriageDate != null },
        )
        assertEquals(2, result.relationships.count { it.subtype == RelationshipSubtype.ADOPTIVE_PARENT })
        val payload = result.archivePayload(Instant.EPOCH)
        assertEquals(payload.tree.id, payload.people.first().treeId)
    }

    @Test
    fun rejectsEmptyMalformedAndPeopleFreeFiles() {
        assertThrows(GedcomException.EmptyFile::class.java) { GedcomImporter.parse(byteArrayOf(), "x.ged") }
        assertThrows(GedcomException.MalformedLine::class.java) { GedcomImporter.parse("wrong".encodeToByteArray(), "x.ged") }
        assertThrows(GedcomException.NoPeople::class.java) { GedcomImporter.parse("0 HEAD\n0 TRLR\n".encodeToByteArray(), "x.ged") }
    }

    @Test
    fun importsCaseInsensitiveEnglishMonthNames() {
        val source = "0 @I1@ INDI\n1 NAME Rina\n1 BIRT\n2 DATE 23 apr 1990\n0 TRLR\n"
        val result = GedcomImporter.parse(source.encodeToByteArray(), "Rina.ged")

        assertEquals("1990-04-23", ArchiveDates.calendarDate(result.people.single().birthDate))
    }

    @Test
    fun exportsGedcom7SubsetWithSanitizedTextAssociationsAndPedigree() {
        val parent = Person(id = "parent", treeId = "tree", displayName = "Rina / Putri", gender = PersonGender.FEMALE,
            notes = "One\nTwo", city = "Bandung", birthDate = Instant.parse("1980-06-03T00:00:00Z"))
        val child = Person(id = "child", treeId = "tree", displayName = "Nadia")
        val relationship = FamilyRelationship(
            id = "r", treeId = "tree", fromPersonId = parent.id, toPersonId = child.id,
            kind = RelationshipKind.PARENT, subtype = RelationshipSubtype.FOSTER_PARENT,
        )

        val output = GedcomExporter.export(listOf(parent, child), listOf(relationship))

        assertTrue(output.startsWith("0 HEAD\n1 GEDC\n2 VERS 7.0"))
        assertTrue(output.contains("1 NAME Rina   Putri"))
        assertTrue(output.contains("2 DATE 3 JUN 1980"))
        assertTrue(output.contains("2 CONT Two"))
        assertTrue(output.contains("2 PEDI foster"))
        assertTrue(output.endsWith("0 TRLR\n"))
    }

    @Test
    fun semanticSubtypesRoundTripThroughAssociationsAndFamilyExtensions() {
        val first = Person(id = "a", treeId = "tree", displayName = "A", createdAt = Instant.EPOCH)
        val second = Person(id = "b", treeId = "tree", displayName = "B", createdAt = Instant.EPOCH.plusSeconds(1))
        val third = Person(id = "c", treeId = "tree", displayName = "C", createdAt = Instant.EPOCH.plusSeconds(2))
        val relationships = listOf(
            relation("sibling", first, second, RelationshipKind.SIBLING, RelationshipSubtype.HALF_SIBLING),
            relation("spouse", first, third, RelationshipKind.PARTNER, RelationshipSubtype.SPOUSE),
            relation("former", second, third, RelationshipKind.PARTNER, RelationshipSubtype.FORMER_PARTNER),
        )

        val exported = GedcomExporter.export(listOf(first, second, third), relationships)
        val imported = GedcomImporter.parse(exported.encodeToByteArray(), "semantic.ged")

        assertTrue(exported.contains("2 RELA halfSibling"))
        assertTrue(exported.contains("1 _HERITG_TYPE formerPartner"))
        assertEquals(3, imported.relationships.size)
        assertEquals(
            setOf(RelationshipSubtype.HALF_SIBLING, RelationshipSubtype.SPOUSE, RelationshipSubtype.FORMER_PARTNER),
            imported.relationships.mapNotNull { it.subtype }.toSet(),
        )
    }

    @Test
    fun reversedSymmetricAssociationsAreDeduplicated() {
        val source = """
            0 @I1@ INDI
            1 NAME One
            1 ASSO @I2@
            2 RELA stepSibling
            0 @I2@ INDI
            1 NAME Two
            1 ASSO @I1@
            2 RELA stepSibling
            0 TRLR
        """.trimIndent()

        val result = GedcomImporter.parse(source.encodeToByteArray(), "siblings.ged")

        assertEquals(1, result.relationships.size)
        assertEquals(RelationshipSubtype.STEP_SIBLING, result.relationships.single().subtype)
    }

    private fun relation(
        id: String,
        from: Person,
        to: Person,
        kind: RelationshipKind,
        subtype: RelationshipSubtype,
    ) = FamilyRelationship(
        id = id,
        treeId = from.treeId,
        fromPersonId = from.id,
        toPersonId = to.id,
        kind = kind,
        subtype = subtype,
        createdAt = Instant.EPOCH,
    )
}
