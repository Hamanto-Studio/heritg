package tech.robihamanto.heritg.android.core.interop

import java.text.Normalizer

object ArchivePasswordPolicy {
    const val MINIMUM_CODE_POINTS = 8

    fun accepts(password: String): Boolean {
        if (password.isEmpty()) return true
        val normalized = Normalizer.normalize(password, Normalizer.Form.NFC)
        val codePoints = normalized.codePoints().toArray()
        return codePoints.size >= MINIMUM_CODE_POINTS &&
            codePoints.any { Character.getType(it) == Character.UPPERCASE_LETTER.toInt() } &&
            codePoints.any { Character.getType(it) == Character.LOWERCASE_LETTER.toInt() } &&
            codePoints.any { Character.getType(it) == Character.DECIMAL_DIGIT_NUMBER.toInt() }
    }
}
