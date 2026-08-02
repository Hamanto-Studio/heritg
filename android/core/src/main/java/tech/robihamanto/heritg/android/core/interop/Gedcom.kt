package tech.robihamanto.heritg.android.core.interop

import tech.robihamanto.heritg.android.core.model.BirthDatePrecision
import tech.robihamanto.heritg.android.core.model.FamilyRelationship
import tech.robihamanto.heritg.android.core.model.FamilyTree
import tech.robihamanto.heritg.android.core.model.GenealogyDates
import tech.robihamanto.heritg.android.core.model.Person
import tech.robihamanto.heritg.android.core.model.PersonGender
import tech.robihamanto.heritg.android.core.model.RelationshipKind
import tech.robihamanto.heritg.android.core.model.RelationshipSubtype
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeFormatterBuilder
import java.time.format.DateTimeParseException
import java.util.Locale

data class GedcomImport(
    val suggestedTitle: String,
    val people: List<GedcomPerson>,
    val relationships: List<GedcomRelationship>,
    val warnings: List<String>,
) {
    fun archivePayload(now: Instant = Instant.now()): ArchivePayload {
        val tree = FamilyTree(title = suggestedTitle, createdAt = now, updatedAt = now)
        val ids = people.associate { it.sourceId to tech.robihamanto.heritg.android.core.model.newId() }
        return ArchivePayload(
            exportedAt = now,
            tree = tree,
            people = people.mapIndexed { index, value ->
                Person(
                    id = ids.getValue(value.sourceId), treeId = tree.id, displayName = value.name,
                    gender = value.gender, createdAt = now.plusMillis(index.toLong()),
                    birthDate = value.birthDate, deathDate = value.deathDate,
                    birthDatePrecision = value.birthDatePrecision, city = value.city, notes = value.notes,
                )
            },
            relationships = relationships.mapIndexed { index, value ->
                FamilyRelationship(
                    treeId = tree.id, fromPersonId = ids.getValue(value.fromSourceId),
                    toPersonId = ids.getValue(value.toSourceId), kind = value.kind,
                    subtype = value.subtype ?: RelationshipSubtype.defaultFor(value.kind),
                    marriageDate = value.marriageDate, createdAt = now.plusMillis(index.toLong()),
                )
            },
        )
    }
}

data class GedcomPerson(
    val sourceId: String,
    var name: String = "Unnamed person",
    var gender: PersonGender = PersonGender.UNSPECIFIED,
    var birthDate: Instant? = null,
    var deathDate: Instant? = null,
    var birthDatePrecision: BirthDatePrecision = BirthDatePrecision.EXACT,
    var city: String = "",
    var notes: String = "",
)

data class GedcomRelationship(
    val fromSourceId: String,
    val toSourceId: String,
    val kind: RelationshipKind,
    val subtype: RelationshipSubtype? = null,
    val marriageDate: Instant? = null,
)

sealed class GedcomException(message: String) : IllegalArgumentException(message) {
    data object EmptyFile : GedcomException("The GEDCOM file is empty.")
    data object FileTooLarge : GedcomException("The GEDCOM file is larger than 25 MB.")
    class MalformedLine(val line: Int) : GedcomException("The GEDCOM file is invalid near line $line.")
    data object TooManyRecords : GedcomException("The GEDCOM file contains too many records.")
    data object NoPeople : GedcomException("The GEDCOM file does not contain any people.")
}

object GedcomImporter {
    const val MaximumBytes = 25 * 1024 * 1024
    private const val MaximumRecords = 50_000

    fun parse(data: ByteArray, sourceName: String): GedcomImport {
        if (data.isEmpty()) throw GedcomException.EmptyFile
        if (data.size > MaximumBytes) throw GedcomException.FileTooLarge
        val text = decode(data)
        val people = linkedMapOf<String, GedcomPerson>()
        val families = mutableListOf<ImportedFamily>()
        val associations = mutableListOf<ImportedAssociation>()
        val warnings = mutableListOf<String>()
        var personId: String? = null
        var family: ImportedFamily? = null
        var association: ImportedAssociation? = null
        var event: Event? = null
        var notePersonId: String? = null
        var references = 0
        fun finishAssociation() {
            association?.takeIf { it.subtype != null }?.let(associations::add)
            association = null
        }
        text.lineSequence().filter { it.isNotEmpty() }.forEachIndexed { offset, line ->
            if (line.encodeToByteArray().size > 65_536) throw GedcomException.MalformedLine(offset + 1)
            val values = line.trim().split(Regex("\\s+"), limit = 3)
            val level = values.firstOrNull()?.toIntOrNull() ?: throw GedcomException.MalformedLine(offset + 1)
            if (values.size < 2) throw GedcomException.MalformedLine(offset + 1)
            if (level == 0) {
                finishAssociation()
                family?.let(families::add)
                family = null; personId = null; event = null; notePersonId = null
                if (values.size == 3) {
                    val id = values[1].trim('@')
                    when (values[2].uppercase(Locale.ROOT)) {
                        "INDI" -> if (id in people) warnings += "Duplicate person record @$id@ was ignored."
                        else { people[id] = GedcomPerson(id); personId = id }
                        "FAM" -> family = ImportedFamily()
                    }
                }
                if (people.size + families.size > MaximumRecords) throw GedcomException.TooManyRecords
                return@forEachIndexed
            }
            val tag = values[1].uppercase(Locale.ROOT)
            val value = values.getOrElse(2) { "" }
            personId?.let { id ->
                val person = people.getValue(id)
                if (level == 1) { finishAssociation(); event = null; notePersonId = null }
                when (level to tag) {
                    1 to "NAME" -> person.name = clean(value).ifEmpty { "Unnamed person" }
                    1 to "SEX" -> person.gender = when (value.uppercase(Locale.ROOT)) {
                        "M" -> PersonGender.MALE; "F" -> PersonGender.FEMALE; else -> PersonGender.UNSPECIFIED
                    }
                    1 to "BIRT" -> event = Event.BIRTH
                    1 to "DEAT" -> event = Event.DEATH
                    1 to "ADDR" -> event = Event.ADDRESS
                    1 to "NOTE" -> { person.notes = value; notePersonId = id }
                    1 to "ASSO" -> {
                        association = ImportedAssociation(id, reference(value))
                        references++
                        if (references > MaximumRecords) throw GedcomException.TooManyRecords
                    }
                    2 to "RELA", 2 to "_HERITG_TYPE" -> {
                        association?.subtype = relationshipSubtype(value)
                    }
                    2 to "DATE" -> parseDate(value)?.let { parsed ->
                        if (event == Event.BIRTH) { person.birthDate = parsed.first; person.birthDatePrecision = parsed.second }
                        else if (event == Event.DEATH) person.deathDate = parsed.first
                    } ?: run { warnings += "A date for ${person.name} could not be imported: $value" }
                    2 to "CITY" -> if (event == Event.ADDRESS) person.city = value.trim()
                    2 to "PLAC" -> warnings += "A place for ${person.name} was not imported because event places are not supported yet."
                    2 to "CONT" -> if (notePersonId == id) person.notes += if (person.notes.isEmpty()) value else "\n$value"
                }
            } ?: family?.let { current ->
                if (level == 1) event = null
                when (level to tag) {
                    1 to "HUSB", 1 to "WIFE" -> reference(value).let {
                        if (it !in current.parents && current.parents.size < 2) { current.parents += it; references++ }
                    }
                    1 to "CHIL" -> reference(value).let {
                        if (current.children.none { child -> child.id == it }) { current.children += ImportedChild(it); references++ }
                    }
                    2 to "PEDI" -> current.children.lastOrNull()?.subtype = when (value.uppercase(Locale.ROOT)) {
                        "ADOPTED" -> RelationshipSubtype.ADOPTIVE_PARENT
                        "FOSTER" -> RelationshipSubtype.FOSTER_PARENT
                        else -> current.children.lastOrNull()?.subtype
                    }
                    2 to "_HERITG_TYPE" -> relationshipSubtype(value)?.takeIf {
                        it.isValidFor(RelationshipKind.PARENT)
                    }?.let { current.children.lastOrNull()?.subtype = it }
                    1 to "MARR" -> event = Event.MARRIAGE
                    1 to "_HERITG_TYPE" -> relationshipSubtype(value)?.takeIf {
                        it.isValidFor(RelationshipKind.PARTNER)
                    }?.let { current.partnerSubtype = it }
                    2 to "DATE" -> if (event == Event.MARRIAGE) current.marriageDate = parseDate(value)?.first
                }
                if (references > MaximumRecords) throw GedcomException.TooManyRecords
            }
        }
        finishAssociation()
        family?.let(families::add)
        if (people.isEmpty()) throw GedcomException.NoPeople
        val relationships = relationships(associations, families, people.keys)
        val file = sourceName.substringAfterLast('/').substringBeforeLast('.', sourceName).trim()
        return GedcomImport(file.ifEmpty { "Imported Family Tree" }, people.values.toList(), relationships, warnings)
    }

    private fun relationships(
        associations: List<ImportedAssociation>,
        families: List<ImportedFamily>,
        valid: Set<String>,
    ): List<GedcomRelationship> {
        val signatures = mutableSetOf<Triple<RelationshipKind, String, String>>()
        val result = mutableListOf<GedcomRelationship>()
        fun add(value: GedcomRelationship) {
            if (value.fromSourceId !in valid || value.toSourceId !in valid ||
                value.fromSourceId == value.toSourceId
            ) return
            val endpoints = if (value.kind == RelationshipKind.PARENT || value.fromSourceId <= value.toSourceId) {
                value.fromSourceId to value.toSourceId
            } else value.toSourceId to value.fromSourceId
            val normalized = value.copy(fromSourceId = endpoints.first, toSourceId = endpoints.second)
            if (signatures.add(Triple(value.kind, endpoints.first, endpoints.second))) result += normalized
            if (result.size > MaximumRecords) throw GedcomException.TooManyRecords
        }
        associations.forEach { association ->
            val subtype = association.subtype ?: return@forEach
            val kind = RelationshipKind.entries.firstOrNull(subtype::isValidFor) ?: return@forEach
            add(GedcomRelationship(association.fromSourceId, association.toSourceId, kind, subtype))
        }
        families.forEach { family ->
            val parents = family.parents.filter { it in valid }
            val children = family.children.filter { it.id in valid }
            if (parents.size >= 2) parents.take(2).sorted().let {
                add(GedcomRelationship(it[0], it[1], RelationshipKind.PARTNER,
                    family.partnerSubtype ?: if (family.marriageDate == null) {
                        RelationshipSubtype.PARTNER
                    } else RelationshipSubtype.SPOUSE,
                    family.marriageDate))
            }
            parents.forEach { parent -> children.filter { it.id != parent }.forEach { child ->
                add(GedcomRelationship(parent, child.id, RelationshipKind.PARENT, child.subtype))
            } }
        }
        return result
    }

    private fun decode(data: ByteArray): String = try {
        StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(data)).toString()
    } catch (_: Exception) { String(data, Charsets.ISO_8859_1) }

    private fun parseDate(raw: String): Pair<Instant, BirthDatePrecision>? {
        var value = raw.uppercase(Locale.ROOT).trim()
        listOf("ABT ", "BEF ", "AFT ", "CAL ", "EST ").firstOrNull(value::startsWith)?.let {
            value = value.removePrefix(it)
        }
        val formats = listOf(
            "d MMM uuuu" to BirthDatePrecision.EXACT,
            "MMM uuuu" to BirthDatePrecision.MONTH,
            "uuuu" to BirthDatePrecision.YEAR,
        )
        formats.forEach { (pattern, precision) -> try {
            val formatter = DateTimeFormatterBuilder()
                .parseCaseInsensitive()
                .appendPattern(pattern)
                .toFormatter(Locale.US)
            val date = when (precision) {
                BirthDatePrecision.EXACT -> LocalDate.parse(value, formatter)
                BirthDatePrecision.MONTH -> java.time.YearMonth.parse(value, formatter).atDay(1)
                BirthDatePrecision.YEAR -> java.time.Year.parse(value, formatter).atDay(1)
            }
            return GenealogyDates.fromCalendarDate(date) to precision
        } catch (_: DateTimeParseException) { } }
        return null
    }

    private fun clean(value: String) = value.replace('/', ' ').trim().split(Regex("\\s+")).joinToString(" ")
    private fun reference(value: String) = value.trim('@', ' ')
    private fun relationshipSubtype(value: String): RelationshipSubtype? =
        RelationshipSubtype.entries.firstOrNull { it.wireName.equals(value.trim(), ignoreCase = true) }
    private enum class Event { BIRTH, DEATH, MARRIAGE, ADDRESS }
    private data class ImportedFamily(
        val parents: MutableList<String> = mutableListOf(),
        val children: MutableList<ImportedChild> = mutableListOf(),
        var marriageDate: Instant? = null,
        var partnerSubtype: RelationshipSubtype? = null,
    )
    private data class ImportedChild(val id: String, var subtype: RelationshipSubtype? = null)
    private data class ImportedAssociation(
        val fromSourceId: String,
        val toSourceId: String,
        var subtype: RelationshipSubtype? = null,
    )
}

object GedcomExporter {
    fun export(people: List<Person>, relationships: List<FamilyRelationship>): String {
        val byId = people.associateBy { it.id }
        val lines = mutableListOf("0 HEAD", "1 GEDC", "2 VERS 7.0", "1 CHAR UTF-8", "1 SOUR Heritg",
            "2 NAME Heritg Family Archive", "2 VERS 1.0")
        people.sortedBy { it.createdAt }.forEach { person ->
            lines += "0 @I${person.id}@ INDI"; lines += "1 NAME ${clean(person.displayName)}"
            lines += "1 SEX ${when (person.gender) { PersonGender.MALE -> "M"; PersonGender.FEMALE -> "F"; else -> "U" }}"
            person.birthDate?.let { lines += listOf("1 BIRT", "2 DATE ${date(it)}") }
            person.deathDate?.let { lines += listOf("1 DEAT", "2 DATE ${date(it)}") }
            person.city.trim().takeIf(String::isNotEmpty)?.let { lines += listOf("1 ADDR", "2 CITY ${clean(it)}") }
            person.notes.lineSequence().map(::clean).filter(String::isNotEmpty).toList().let { notes ->
                notes.firstOrNull()?.let { lines += "1 NOTE $it" }
                notes.drop(1).forEach { lines += "2 CONT $it" }
            }
            relationships.filter { it.fromPersonId == person.id }.forEach { relationship ->
                if (relationship.toPersonId in byId) lines += listOf(
                    "1 ASSO @I${relationship.toPersonId}@", "2 RELA ${relationship.subtype.wireName}")
            }
        }
        var index = 1
        relationships.filter { it.kind == RelationshipKind.PARENT }.forEach { relationship ->
            val parent = byId[relationship.fromPersonId] ?: return@forEach
            val child = byId[relationship.toPersonId] ?: return@forEach
            lines += "0 @F${index++}@ FAM"; familyPerson(lines, parent); lines += "1 CHIL @I${child.id}@"
            when (relationship.subtype) {
                RelationshipSubtype.ADOPTIVE_PARENT -> lines += "2 PEDI adopted"
                RelationshipSubtype.FOSTER_PARENT -> lines += "2 PEDI foster"
                RelationshipSubtype.BIOLOGICAL_PARENT -> Unit
                else -> lines += "2 _HERITG_TYPE ${relationship.subtype.wireName}"
            }
        }
        val pairs = mutableSetOf<Pair<String, String>>()
        relationships.filter { it.kind == RelationshipKind.PARTNER }.forEach { relationship ->
            val pair = listOf(relationship.fromPersonId, relationship.toPersonId).sorted()
            if (!pairs.add(pair[0] to pair[1])) return@forEach
            val first = byId[pair[0]] ?: return@forEach; val second = byId[pair[1]] ?: return@forEach
            lines += "0 @F${index++}@ FAM"; familyPerson(lines, first); familyPerson(lines, second)
            lines += "1 _HERITG_TYPE ${relationship.subtype.wireName}"
            relationship.marriageDate?.let { lines += listOf("1 MARR", "2 DATE ${date(it)}") }
        }
        lines += "0 TRLR"
        return lines.joinToString("\n", postfix = "\n")
    }

    private fun familyPerson(lines: MutableList<String>, person: Person) {
        lines += "1 ${if (person.gender == PersonGender.FEMALE) "WIFE" else "HUSB"} @I${person.id}@"
    }
    private fun date(value: Instant) = DateTimeFormatter.ofPattern("d MMM uuuu", Locale.US)
        .format(GenealogyDates.toCalendarDate(value)).uppercase(Locale.US)
    private fun clean(value: String) = value.replace('\n', ' ').replace('\r', ' ').replace('/', ' ').trim()
}
