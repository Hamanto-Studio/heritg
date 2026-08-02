package tech.robihamanto.heritg.android.core.domain

import tech.robihamanto.heritg.android.core.model.FamilyRelationship
import tech.robihamanto.heritg.android.core.model.Person
import tech.robihamanto.heritg.android.core.model.PersonGender
import tech.robihamanto.heritg.android.core.model.RelationshipKind
import tech.robihamanto.heritg.android.core.model.RelationshipSubtype

enum class RelativeRole(
    val wireName: String,
    val gender: PersonGender,
    val kind: RelationshipKind,
    val subtype: RelationshipSubtype,
    val relativeIsParent: Boolean = false,
) {
    FATHER("father", PersonGender.MALE, RelationshipKind.PARENT, RelationshipSubtype.BIOLOGICAL_PARENT, true),
    MOTHER("mother", PersonGender.FEMALE, RelationshipKind.PARENT, RelationshipSubtype.BIOLOGICAL_PARENT, true),
    BROTHER("brother", PersonGender.MALE, RelationshipKind.SIBLING, RelationshipSubtype.SIBLING),
    SISTER("sister", PersonGender.FEMALE, RelationshipKind.SIBLING, RelationshipSubtype.SIBLING),
    PARTNER("partner", PersonGender.UNSPECIFIED, RelationshipKind.PARTNER, RelationshipSubtype.PARTNER),
    SON("son", PersonGender.MALE, RelationshipKind.PARENT, RelationshipSubtype.BIOLOGICAL_PARENT),
    DAUGHTER("daughter", PersonGender.FEMALE, RelationshipKind.PARENT, RelationshipSubtype.BIOLOGICAL_PARENT),
    ADOPTIVE_FATHER("adoptiveFather", PersonGender.MALE, RelationshipKind.PARENT, RelationshipSubtype.ADOPTIVE_PARENT, true),
    ADOPTIVE_MOTHER("adoptiveMother", PersonGender.FEMALE, RelationshipKind.PARENT, RelationshipSubtype.ADOPTIVE_PARENT, true),
    FOSTER_FATHER("fosterFather", PersonGender.MALE, RelationshipKind.PARENT, RelationshipSubtype.FOSTER_PARENT, true),
    FOSTER_MOTHER("fosterMother", PersonGender.FEMALE, RelationshipKind.PARENT, RelationshipSubtype.FOSTER_PARENT, true),
    GUARDIAN("guardian", PersonGender.UNSPECIFIED, RelationshipKind.PARENT, RelationshipSubtype.GUARDIAN, true),
    STEPFATHER("stepfather", PersonGender.MALE, RelationshipKind.PARENT, RelationshipSubtype.STEP_PARENT, true),
    STEPMOTHER("stepmother", PersonGender.FEMALE, RelationshipKind.PARENT, RelationshipSubtype.STEP_PARENT, true),
    HALF_BROTHER("halfBrother", PersonGender.MALE, RelationshipKind.SIBLING, RelationshipSubtype.HALF_SIBLING),
    HALF_SISTER("halfSister", PersonGender.FEMALE, RelationshipKind.SIBLING, RelationshipSubtype.HALF_SIBLING),
    ADOPTIVE_BROTHER("adoptiveBrother", PersonGender.MALE, RelationshipKind.SIBLING, RelationshipSubtype.ADOPTIVE_SIBLING),
    ADOPTIVE_SISTER("adoptiveSister", PersonGender.FEMALE, RelationshipKind.SIBLING, RelationshipSubtype.ADOPTIVE_SIBLING),
    FOSTER_BROTHER("fosterBrother", PersonGender.MALE, RelationshipKind.SIBLING, RelationshipSubtype.FOSTER_SIBLING),
    FOSTER_SISTER("fosterSister", PersonGender.FEMALE, RelationshipKind.SIBLING, RelationshipSubtype.FOSTER_SIBLING),
    STEPBROTHER("stepbrother", PersonGender.MALE, RelationshipKind.SIBLING, RelationshipSubtype.STEP_SIBLING),
    STEPSISTER("stepsister", PersonGender.FEMALE, RelationshipKind.SIBLING, RelationshipSubtype.STEP_SIBLING),
    HUSBAND("husband", PersonGender.MALE, RelationshipKind.PARTNER, RelationshipSubtype.SPOUSE),
    WIFE("wife", PersonGender.FEMALE, RelationshipKind.PARTNER, RelationshipSubtype.SPOUSE),
    FORMER_PARTNER("formerPartner", PersonGender.UNSPECIFIED, RelationshipKind.PARTNER, RelationshipSubtype.FORMER_PARTNER),
    FORMER_HUSBAND("formerHusband", PersonGender.MALE, RelationshipKind.PARTNER, RelationshipSubtype.FORMER_SPOUSE),
    FORMER_WIFE("formerWife", PersonGender.FEMALE, RelationshipKind.PARTNER, RelationshipSubtype.FORMER_SPOUSE),
    ADOPTIVE_SON("adoptiveSon", PersonGender.MALE, RelationshipKind.PARENT, RelationshipSubtype.ADOPTIVE_PARENT),
    ADOPTIVE_DAUGHTER("adoptiveDaughter", PersonGender.FEMALE, RelationshipKind.PARENT, RelationshipSubtype.ADOPTIVE_PARENT),
    FOSTER_SON("fosterSon", PersonGender.MALE, RelationshipKind.PARENT, RelationshipSubtype.FOSTER_PARENT),
    FOSTER_DAUGHTER("fosterDaughter", PersonGender.FEMALE, RelationshipKind.PARENT, RelationshipSubtype.FOSTER_PARENT),
    WARD("ward", PersonGender.UNSPECIFIED, RelationshipKind.PARENT, RelationshipSubtype.GUARDIAN),
    STEPSON("stepson", PersonGender.MALE, RelationshipKind.PARENT, RelationshipSubtype.STEP_PARENT),
    STEPDAUGHTER("stepdaughter", PersonGender.FEMALE, RelationshipKind.PARENT, RelationshipSubtype.STEP_PARENT);

    val relativeIsChild: Boolean get() = kind == RelationshipKind.PARENT && !relativeIsParent
    val allowsCoParent: Boolean get() = relativeIsChild && subtype != RelationshipSubtype.STEP_PARENT
}

data class RelationshipEndpoints(
    val fromPersonId: String,
    val toPersonId: String,
    val kind: RelationshipKind,
    val subtype: RelationshipSubtype,
)

fun relationshipEndpoints(personId: String, relativeId: String, role: RelativeRole): RelationshipEndpoints =
    when {
        role.kind == RelationshipKind.PARENT && role.relativeIsParent ->
            RelationshipEndpoints(relativeId, personId, role.kind, role.subtype)
        role.kind == RelationshipKind.PARENT ->
            RelationshipEndpoints(personId, relativeId, role.kind, role.subtype)
        else -> listOf(personId, relativeId).sorted().let {
            RelationshipEndpoints(it[0], it[1], role.kind, role.subtype)
        }
    }

fun canonicalEndpoints(kind: RelationshipKind, from: String, to: String): Pair<String, String> =
    if (kind == RelationshipKind.PARENT || from <= to) from to to else to to from

fun relativeRoleFor(
    relationship: FamilyRelationship,
    relative: Person,
    focusedPersonId: String,
): RelativeRole {
    val isFemale = relative.gender == PersonGender.FEMALE
    if (relationship.kind == RelationshipKind.PARTNER) return when (relationship.subtype) {
        RelationshipSubtype.SPOUSE -> if (isFemale) RelativeRole.WIFE else RelativeRole.HUSBAND
        RelationshipSubtype.FORMER_SPOUSE -> if (isFemale) RelativeRole.FORMER_WIFE else RelativeRole.FORMER_HUSBAND
        RelationshipSubtype.FORMER_PARTNER -> RelativeRole.FORMER_PARTNER
        else -> RelativeRole.PARTNER
    }
    if (relationship.kind == RelationshipKind.SIBLING) return when (relationship.subtype) {
        RelationshipSubtype.HALF_SIBLING -> if (isFemale) RelativeRole.HALF_SISTER else RelativeRole.HALF_BROTHER
        RelationshipSubtype.ADOPTIVE_SIBLING -> if (isFemale) RelativeRole.ADOPTIVE_SISTER else RelativeRole.ADOPTIVE_BROTHER
        RelationshipSubtype.FOSTER_SIBLING -> if (isFemale) RelativeRole.FOSTER_SISTER else RelativeRole.FOSTER_BROTHER
        RelationshipSubtype.STEP_SIBLING -> if (isFemale) RelativeRole.STEPSISTER else RelativeRole.STEPBROTHER
        else -> if (isFemale) RelativeRole.SISTER else RelativeRole.BROTHER
    }
    val relativeIsParent = relationship.fromPersonId == relative.id && relationship.toPersonId == focusedPersonId
    return when (relationship.subtype to relativeIsParent) {
        RelationshipSubtype.ADOPTIVE_PARENT to true -> if (isFemale) RelativeRole.ADOPTIVE_MOTHER else RelativeRole.ADOPTIVE_FATHER
        RelationshipSubtype.ADOPTIVE_PARENT to false -> if (isFemale) RelativeRole.ADOPTIVE_DAUGHTER else RelativeRole.ADOPTIVE_SON
        RelationshipSubtype.FOSTER_PARENT to true -> if (isFemale) RelativeRole.FOSTER_MOTHER else RelativeRole.FOSTER_FATHER
        RelationshipSubtype.FOSTER_PARENT to false -> if (isFemale) RelativeRole.FOSTER_DAUGHTER else RelativeRole.FOSTER_SON
        RelationshipSubtype.GUARDIAN to true -> RelativeRole.GUARDIAN
        RelationshipSubtype.GUARDIAN to false -> RelativeRole.WARD
        RelationshipSubtype.STEP_PARENT to true -> if (isFemale) RelativeRole.STEPMOTHER else RelativeRole.STEPFATHER
        RelationshipSubtype.STEP_PARENT to false -> if (isFemale) RelativeRole.STEPDAUGHTER else RelativeRole.STEPSON
        else -> if (relativeIsParent) {
            if (isFemale) RelativeRole.MOTHER else RelativeRole.FATHER
        } else if (isFemale) RelativeRole.DAUGHTER else RelativeRole.SON
    }
}
