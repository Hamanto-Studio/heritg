package tech.robihamanto.heritg.android.core.domain

import tech.robihamanto.heritg.android.core.model.Person
import tech.robihamanto.heritg.android.core.model.PersonGender
import tech.robihamanto.heritg.android.core.model.RelationshipKind
import tech.robihamanto.heritg.android.core.model.RelationshipSubtype
import tech.robihamanto.heritg.android.core.model.GenealogyDates
import java.time.Instant
import java.time.ZoneId
import java.util.Locale

fun interface SemanticFormatter {
    fun text(key: String, vararg arguments: Any): String
}

typealias SemanticTextHook = (locale: Locale, key: String, arguments: List<Any>) -> String?

object EnglishSemanticFormatter : SemanticFormatter {
    override fun text(key: String, vararg arguments: Any): String = when (key) {
        "great" -> "great-${arguments[0]}"
        "cousinNth" -> "${arguments[0]}th cousin"
        "onceRemoved" -> "${arguments[0]} once removed"
        "twiceRemoved" -> "${arguments[0]} twice removed"
        "timesRemoved" -> "${arguments[0]} ${arguments[1]} times removed"
        "byMarriage" -> "${arguments[0]} by marriage"
        "born" -> "Born ${arguments[0]}"
        "bornAge" -> "Born ${arguments[0]} · age ${arguments[1]}"
        "yearsAge" -> "${arguments[0]}-${arguments[1]} · age ${arguments[2]}"
        else -> key
    }
}

object IndonesianSemanticFormatter : SemanticFormatter {
    private val terms = mapOf(
        "You" to "Anda", "Family member" to "Anggota keluarga", "Family" to "Keluarga",
        "Parent" to "Orang tua", "Father" to "Ayah", "Mother" to "Ibu", "Child" to "Anak",
        "Son" to "Anak laki-laki", "Daughter" to "Anak perempuan", "Sibling" to "Saudara kandung",
        "Brother" to "Saudara laki-laki", "Sister" to "Saudara perempuan",
        "Grandparent" to "Kakek/Nenek", "Grandfather" to "Kakek", "Grandmother" to "Nenek",
        "Grandchild" to "Cucu", "Grandson" to "Cucu laki-laki", "Granddaughter" to "Cucu perempuan",
        "Aunt/Uncle" to "Bibi/Paman", "Uncle" to "Paman", "Aunt" to "Bibi",
        "Niece/Nephew" to "Keponakan", "Nephew" to "Keponakan laki-laki", "Niece" to "Keponakan perempuan",
        "Cousin" to "Sepupu", "First cousin" to "Sepupu dekat", "Second cousin" to "Sepupu dua kali",
        "Third cousin" to "Sepupu tiga kali", "Partner" to "Pasangan", "Spouse" to "Suami/istri",
        "Husband" to "Suami", "Wife" to "Istri", "Former partner" to "Mantan pasangan",
        "Former spouse" to "Mantan suami/istri", "Former husband" to "Mantan suami", "Former wife" to "Mantan istri",
        "Parent-in-law" to "Mertua", "Father-in-law" to "Ayah mertua", "Mother-in-law" to "Ibu mertua",
        "Child-in-law" to "Menantu", "Son-in-law" to "Menantu laki-laki", "Daughter-in-law" to "Menantu perempuan",
        "Sibling-in-law" to "Ipar", "Brother-in-law" to "Ipar laki-laki", "Sister-in-law" to "Ipar perempuan",
        "Step-parent" to "Orang tua tiri", "Stepfather" to "Ayah tiri", "Stepmother" to "Ibu tiri",
        "Stepchild" to "Anak tiri", "Stepson" to "Anak tiri laki-laki", "Stepdaughter" to "Anak tiri perempuan",
        "Stepsibling" to "Saudara tiri", "Stepbrother" to "Saudara tiri laki-laki", "Stepsister" to "Saudara tiri perempuan",
        "Half-sibling" to "Saudara seayah atau seibu", "Half-brother" to "Saudara laki-laki seayah atau seibu",
        "Half-sister" to "Saudara perempuan seayah atau seibu", "Adoptive parent" to "Orang tua angkat",
        "Adoptive father" to "Ayah angkat", "Adoptive mother" to "Ibu angkat", "Adoptive child" to "Anak angkat",
        "Adoptive son" to "Anak angkat laki-laki", "Adoptive daughter" to "Anak angkat perempuan",
        "Adoptive sibling" to "Saudara angkat", "Adoptive brother" to "Saudara angkat laki-laki",
        "Adoptive sister" to "Saudara angkat perempuan", "Foster parent" to "Orang tua asuh",
        "Foster father" to "Ayah asuh", "Foster mother" to "Ibu asuh", "Foster child" to "Anak asuh",
        "Foster son" to "Anak asuh laki-laki", "Foster daughter" to "Anak asuh perempuan",
        "Foster sibling" to "Saudara asuh", "Foster brother" to "Saudara asuh laki-laki",
        "Foster sister" to "Saudara asuh perempuan", "Guardian" to "Wali", "Ward" to "Anak di bawah perwalian",
    )

    override fun text(key: String, vararg arguments: Any): String = when (key) {
        "great" -> "buyut ${arguments[0]}"
        "cousinNth" -> "Sepupu ${arguments[0]} kali"
        "onceRemoved" -> "${arguments[0]} beda satu generasi"
        "twiceRemoved" -> "${arguments[0]} beda dua generasi"
        "timesRemoved" -> "${arguments[0]} beda ${arguments[1]} generasi"
        "byMarriage" -> "${arguments[0]} karena perkawinan"
        "Married" -> "Menikah"
        "born" -> "Lahir ${arguments[0]}"
        "bornAge" -> "Lahir ${arguments[0]} · usia ${arguments[1]}"
        "yearsAge" -> "${arguments[0]}-${arguments[1]} · usia ${arguments[2]}"
        else -> terms[key] ?: key
    }
}

fun semanticFormatter(locale: Locale, hook: SemanticTextHook? = null): SemanticFormatter {
    val fallback = if (locale.language == "id") IndonesianSemanticFormatter else EnglishSemanticFormatter
    return hook?.let { localized ->
        SemanticFormatter { key, arguments ->
            localized(locale, key, arguments.asList()) ?: fallback.text(key, *arguments)
        }
    } ?: fallback
}

object LifeSummary {
    fun displayNameWithAge(
        person: Person,
        at: Instant = Instant.now(),
        zoneId: ZoneId = ZoneId.systemDefault(),
    ): String {
        val age = person.age(at, zoneId) ?: return person.displayName
        val birthYear = person.birthDate?.let { GenealogyDates.toCalendarDate(it, zoneId).year }
            ?: return person.displayName
        val deathYear = person.deathDate?.let {
            GenealogyDates.toCalendarDate(it, zoneId).year
        }
        return if (deathYear == null) "${person.displayName} ($age)"
        else "${person.displayName} ($age) ($birthYear-$deathYear)"
    }

    fun summary(
        person: Person,
        formatter: SemanticFormatter,
        at: Instant = Instant.now(),
        zoneId: ZoneId = ZoneId.systemDefault(),
    ): String? {
        val birthYear = person.birthDate?.let {
            GenealogyDates.toCalendarDate(it, zoneId).year
        } ?: return null
        val age = person.age(at, zoneId)
        val deathYear = person.deathDate?.let {
            GenealogyDates.toCalendarDate(it, zoneId).year
        }
        return when {
            deathYear != null && age != null -> formatter.text("yearsAge", birthYear, deathYear, age)
            deathYear != null -> "$birthYear-$deathYear"
            age != null -> formatter.text("bornAge", birthYear, age)
            else -> formatter.text("born", birthYear)
        }
    }
}

object FamilyRoleLabel {
    fun label(
        gender: PersonGender,
        kind: RelationshipKind,
        focusedPersonId: String,
        fromPersonId: String,
        toPersonId: String,
        subtype: RelationshipSubtype = RelationshipSubtype.defaultFor(kind),
        formatter: SemanticFormatter = EnglishSemanticFormatter,
    ): String = when (kind) {
        RelationshipKind.PARENT -> parentLabel(gender, subtype, toPersonId == focusedPersonId, formatter)
        RelationshipKind.PARTNER -> when (subtype) {
            RelationshipSubtype.SPOUSE -> gendered(gender, "Husband", "Wife", "Spouse", formatter)
            RelationshipSubtype.FORMER_SPOUSE -> gendered(gender, "Former husband", "Former wife", "Former spouse", formatter)
            RelationshipSubtype.FORMER_PARTNER -> formatter.text("Former partner")
            else -> formatter.text("Partner")
        }
        RelationshipKind.SIBLING -> siblingLabel(gender, subtype, formatter)
    }

    private fun parentLabel(g: PersonGender, s: RelationshipSubtype, parent: Boolean, f: SemanticFormatter): String =
        when (s to parent) {
            RelationshipSubtype.ADOPTIVE_PARENT to true -> gendered(g, "Adoptive father", "Adoptive mother", "Adoptive parent", f)
            RelationshipSubtype.ADOPTIVE_PARENT to false -> gendered(g, "Adoptive son", "Adoptive daughter", "Adoptive child", f)
            RelationshipSubtype.FOSTER_PARENT to true -> gendered(g, "Foster father", "Foster mother", "Foster parent", f)
            RelationshipSubtype.FOSTER_PARENT to false -> gendered(g, "Foster son", "Foster daughter", "Foster child", f)
            RelationshipSubtype.GUARDIAN to true -> f.text("Guardian")
            RelationshipSubtype.GUARDIAN to false -> f.text("Ward")
            RelationshipSubtype.STEP_PARENT to true -> gendered(g, "Stepfather", "Stepmother", "Step-parent", f)
            RelationshipSubtype.STEP_PARENT to false -> gendered(g, "Stepson", "Stepdaughter", "Stepchild", f)
            else -> if (parent) gendered(g, "Father", "Mother", "Parent", f)
            else gendered(g, "Son", "Daughter", "Child", f)
        }

    private fun siblingLabel(g: PersonGender, s: RelationshipSubtype, f: SemanticFormatter): String = when (s) {
        RelationshipSubtype.HALF_SIBLING -> gendered(g, "Half-brother", "Half-sister", "Half-sibling", f)
        RelationshipSubtype.ADOPTIVE_SIBLING -> gendered(g, "Adoptive brother", "Adoptive sister", "Adoptive sibling", f)
        RelationshipSubtype.FOSTER_SIBLING -> gendered(g, "Foster brother", "Foster sister", "Foster sibling", f)
        RelationshipSubtype.STEP_SIBLING -> gendered(g, "Stepbrother", "Stepsister", "Stepsibling", f)
        else -> gendered(g, "Brother", "Sister", "Sibling", f)
    }
}

internal fun gendered(
    gender: PersonGender,
    male: String,
    female: String,
    neutral: String,
    formatter: SemanticFormatter,
): String = formatter.text(when (gender) {
    PersonGender.MALE -> male
    PersonGender.FEMALE -> female
    PersonGender.UNSPECIFIED -> neutral
})
