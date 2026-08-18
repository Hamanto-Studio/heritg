package tech.robihamanto.heritg.android.core.interop

import java.text.Normalizer

object ArchivePasswordPolicy {
    const val MINIMUM_CODE_POINTS = 8

    data class Requirements(
        val minimumLength: Boolean,
        val lowercase: Boolean,
        val uppercase: Boolean,
        val number: Boolean,
        val special: Boolean,
    ) {
        val allMet: Boolean get() = minimumLength && lowercase && uppercase && number && special
    }

    fun requirements(password: String): Requirements {
        val normalized = Normalizer.normalize(password, Normalizer.Form.NFC)
        val codePoints = normalized.codePoints().toArray()
        return Requirements(
            minimumLength = codePoints.size >= MINIMUM_CODE_POINTS,
            lowercase = codePoints.any { Character.getType(it) == Character.LOWERCASE_LETTER.toInt() },
            uppercase = codePoints.any { Character.getType(it) == Character.UPPERCASE_LETTER.toInt() },
            number = codePoints.any { Character.getType(it) == Character.DECIMAL_DIGIT_NUMBER.toInt() },
            special = codePoints.any { Character.getType(it) in specialCharacterTypes },
        )
    }

    fun accepts(password: String): Boolean {
        if (password.isEmpty()) return true
        return requirements(password).allMet
    }

    private val specialCharacterTypes = setOf(
        Character.CONNECTOR_PUNCTUATION.toInt(), Character.DASH_PUNCTUATION.toInt(),
        Character.START_PUNCTUATION.toInt(), Character.END_PUNCTUATION.toInt(),
        Character.INITIAL_QUOTE_PUNCTUATION.toInt(), Character.FINAL_QUOTE_PUNCTUATION.toInt(),
        Character.OTHER_PUNCTUATION.toInt(), Character.MATH_SYMBOL.toInt(),
        Character.CURRENCY_SYMBOL.toInt(), Character.MODIFIER_SYMBOL.toInt(), Character.OTHER_SYMBOL.toInt(),
    )
}
