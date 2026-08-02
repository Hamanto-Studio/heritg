package tech.robihamanto.heritg.android.core.interop

import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.format.DateTimeFormatterBuilder
import java.time.format.ResolverStyle
import java.time.temporal.ChronoField

internal object ArchiveDates {
    private val instantRegex = Regex("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z")
    private val instantFormatter = DateTimeFormatterBuilder().appendInstant(3).toFormatter()
    private val calendarRegex = Regex("\\d{4}-\\d{2}-\\d{2}")
    private val calendarFormatter = DateTimeFormatterBuilder()
        .appendValue(ChronoField.YEAR, 4)
        .appendLiteral('-')
        .appendValue(ChronoField.MONTH_OF_YEAR, 2)
        .appendLiteral('-')
        .appendValue(ChronoField.DAY_OF_MONTH, 2)
        .toFormatter()
        .withResolverStyle(ResolverStyle.STRICT)

    fun instant(value: Instant): String = instantFormatter.format(value).also {
        if (!instantRegex.matches(it)) throw ArchiveException.InvalidArchive()
    }

    fun parseInstant(value: String): Instant {
        if (!instantRegex.matches(value)) throw ArchiveException.InvalidArchive()
        return try {
            Instant.from(instantFormatter.parse(value)).also {
                if (instant(it) != value) throw ArchiveException.InvalidArchive()
            }
        } catch (error: ArchiveException) {
            throw error
        } catch (error: Exception) {
            throw ArchiveException.InvalidArchive(error)
        }
    }

    fun calendarDate(value: Instant?, zoneId: ZoneId = ZoneId.systemDefault()): String? =
        value?.let { instant ->
            val utc = instant.atZone(ZoneOffset.UTC)
            if (utc.toLocalTime() == LocalTime.MIDNIGHT) utc.toLocalDate() else instant.atZone(zoneId).toLocalDate()
        }?.format(calendarFormatter)?.also {
            if (!calendarRegex.matches(it)) throw ArchiveException.InvalidArchive()
        }

    fun parseCalendarDate(value: String?, zoneId: ZoneId = ZoneOffset.UTC): Instant? {
        value ?: return null
        if (!calendarRegex.matches(value)) throw ArchiveException.InvalidArchive()
        return try {
            LocalDate.parse(value, calendarFormatter).atStartOfDay(zoneId).toInstant()
        } catch (error: Exception) {
            throw ArchiveException.InvalidArchive(error)
        }
    }
}

internal fun mediaInfo(bytes: ByteArray): MediaValue {
    val digest = sha256(bytes)
    val type = when {
        bytes.startsWith(byteArrayOf(0x89.toByte(), 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) ->
            "png" to "image/png"
        bytes.startsWith(byteArrayOf(0xff.toByte(), 0xd8.toByte(), 0xff.toByte())) ->
            "jpg" to "image/jpeg"
        bytes.startsWith("GIF87a".encodeToByteArray()) || bytes.startsWith("GIF89a".encodeToByteArray()) ->
            "gif" to "image/gif"
        bytes.size >= 12 && bytes.copyOfRange(0, 4).contentEquals("RIFF".encodeToByteArray()) &&
            bytes.copyOfRange(8, 12).contentEquals("WEBP".encodeToByteArray()) -> "webp" to "image/webp"
        bytes.size >= 12 && bytes.copyOfRange(4, 8).contentEquals("ftyp".encodeToByteArray()) &&
            bytes.copyOfRange(8, 12).decodeToString() in setOf("heic", "heix", "hevc", "hevx", "mif1", "msf1") ->
            "heic" to "image/heic"
        else -> "bin" to "application/octet-stream"
    }
    val path = "${ArchiveConstants.MediaPrefix}$digest.${type.first}"
    return MediaValue(MediaReference(bytes.size, type.second, path, digest), bytes)
}

internal fun sha256(bytes: ByteArray): String = java.security.MessageDigest.getInstance("SHA-256")
    .digest(bytes).joinToString("") { "%02x".format(it) }

private fun ByteArray.startsWith(prefix: ByteArray): Boolean =
    size >= prefix.size && prefix.indices.all { this[it] == prefix[it] }
