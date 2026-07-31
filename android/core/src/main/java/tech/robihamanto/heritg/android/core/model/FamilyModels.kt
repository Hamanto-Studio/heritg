package tech.robihamanto.heritg.android.core.model

import java.time.Instant
import java.time.LocalDate
import java.time.Period
import java.time.ZoneId
import java.util.UUID

enum class RelationshipKind(val wireName: String) {
    PARENT("parent"), PARTNER("partner"), SIBLING("sibling");

    companion object {
        fun fromWire(value: String) = entries.firstOrNull { it.wireName == value }
    }
}

enum class RelationshipSubtype(val wireName: String) {
    BIOLOGICAL_PARENT("biologicalParent"),
    ADOPTIVE_PARENT("adoptiveParent"),
    FOSTER_PARENT("fosterParent"),
    GUARDIAN("guardian"),
    STEP_PARENT("stepParent"),
    PARTNER("partner"),
    SPOUSE("spouse"),
    FORMER_PARTNER("formerPartner"),
    FORMER_SPOUSE("formerSpouse"),
    SIBLING("sibling"),
    HALF_SIBLING("halfSibling"),
    ADOPTIVE_SIBLING("adoptiveSibling"),
    FOSTER_SIBLING("fosterSibling"),
    STEP_SIBLING("stepSibling");

    val contributesToAncestry: Boolean
        get() = this == BIOLOGICAL_PARENT || this == ADOPTIVE_PARENT
    val isActiveUnion: Boolean get() = this == PARTNER || this == SPOUSE

    fun isValidFor(kind: RelationshipKind): Boolean = when (kind) {
        RelationshipKind.PARENT -> this in setOf(
            BIOLOGICAL_PARENT, ADOPTIVE_PARENT, FOSTER_PARENT, GUARDIAN, STEP_PARENT,
        )
        RelationshipKind.PARTNER -> this in setOf(PARTNER, SPOUSE, FORMER_PARTNER, FORMER_SPOUSE)
        RelationshipKind.SIBLING -> this in setOf(
            SIBLING, HALF_SIBLING, ADOPTIVE_SIBLING, FOSTER_SIBLING, STEP_SIBLING,
        )
    }

    companion object {
        fun fromWire(value: String) = entries.firstOrNull { it.wireName == value }
        fun defaultFor(kind: RelationshipKind) = when (kind) {
            RelationshipKind.PARENT -> BIOLOGICAL_PARENT
            RelationshipKind.PARTNER -> PARTNER
            RelationshipKind.SIBLING -> SIBLING
        }
    }
}

enum class PersonGender(val wireName: String) {
    UNSPECIFIED("unspecified"), FEMALE("female"), MALE("male");

    companion object {
        fun fromWire(value: String) = entries.firstOrNull { it.wireName == value }
    }
}

enum class BirthDatePrecision(val wireName: String) {
    EXACT("exact"), MONTH("month"), YEAR("year");

    companion object {
        fun fromWire(value: String) = entries.firstOrNull { it.wireName == value }
    }
}

data class FamilyTree(
    val id: String = newId(),
    val title: String,
    val createdAt: Instant = Instant.now(),
    val updatedAt: Instant = Instant.now(),
    val lastSelectedPersonId: String? = null,
) {
    fun resolvedFocusId(people: List<Person>): String? = lastSelectedPersonId
        ?.takeIf { selected -> people.any { it.treeId == id && it.id == selected } }
        ?: people.firstOrNull { it.treeId == id }?.id
}

data class Person(
    val id: String = newId(),
    val treeId: String,
    val displayName: String,
    val gender: PersonGender = PersonGender.UNSPECIFIED,
    val createdAt: Instant = Instant.now(),
    val birthDate: Instant? = null,
    val deathDate: Instant? = null,
    val birthDatePrecision: BirthDatePrecision = BirthDatePrecision.EXACT,
    val notes: String = "",
    val addressLine: String = "",
    val city: String = "",
    val province: String = "",
    val country: String = "",
    val postalCode: String = "",
    val profilePhotoData: ByteArray? = null,
) {
    fun age(at: Instant = Instant.now(), zoneId: ZoneId = ZoneId.systemDefault()): Int? {
        val birth = birthDate?.atZone(zoneId)?.toLocalDate() ?: return null
        val reference = (deathDate ?: at).atZone(zoneId).toLocalDate()
        if (reference < birth) return null
        return Period.between(birth, reference).years
    }

    override fun equals(other: Any?): Boolean = other is Person &&
        id == other.id && treeId == other.treeId && displayName == other.displayName &&
        gender == other.gender && createdAt == other.createdAt && birthDate == other.birthDate &&
        deathDate == other.deathDate && birthDatePrecision == other.birthDatePrecision &&
        notes == other.notes && addressLine == other.addressLine && city == other.city &&
        province == other.province && country == other.country && postalCode == other.postalCode &&
        profilePhotoData.contentEqualsNullable(other.profilePhotoData)

    override fun hashCode(): Int = listOf<Any?>(
        id, treeId, displayName, gender, createdAt, birthDate, deathDate, birthDatePrecision,
        notes, addressLine, city, province, country, postalCode,
    ).hashCode() * 31 + (profilePhotoData?.contentHashCode() ?: 0)
}

data class FamilyRelationship(
    val id: String = newId(),
    val treeId: String,
    val fromPersonId: String,
    val toPersonId: String,
    val kind: RelationshipKind,
    val subtype: RelationshipSubtype = RelationshipSubtype.defaultFor(kind),
    val createdAt: Instant = Instant.now(),
    val marriageDate: Instant? = null,
) {
    val marriageYear: String?
        get() = marriageDate?.takeIf { kind == RelationshipKind.PARTNER }
            ?.atZone(ZoneId.systemDefault())?.year?.toString()
}

data class PersonDetails(
    val birthDate: Instant? = null,
    val deathDate: Instant? = null,
    val birthDatePrecision: BirthDatePrecision = BirthDatePrecision.EXACT,
    val notes: String = "",
    val addressLine: String = "",
    val city: String = "",
    val province: String = "",
    val country: String = "",
    val postalCode: String = "",
    val profilePhotoData: ByteArray? = null,
)

fun newId(): String = UUID.randomUUID().toString().lowercase()

private fun ByteArray?.contentEqualsNullable(other: ByteArray?): Boolean = when {
    this == null -> other == null
    other == null -> false
    else -> contentEquals(other)
}
