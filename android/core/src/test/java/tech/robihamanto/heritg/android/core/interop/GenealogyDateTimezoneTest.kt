package tech.robihamanto.heritg.android.core.interop

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test
import tech.robihamanto.heritg.android.core.model.GenealogyDates
import tech.robihamanto.heritg.android.core.model.Person
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.util.TimeZone

class GenealogyDateTimezoneTest {
    private val originalTimeZone = TimeZone.getDefault()

    @After
    fun restoreTimeZone() = TimeZone.setDefault(originalTimeZone)

    @Test
    fun canonicalCalendarDateDoesNotMoveAcrossExtremeTimeZones() {
        val value = GenealogyDates.fromCalendarDate(LocalDate.of(1990, 4, 23))
        listOf("Pacific/Kiritimati", "Pacific/Honolulu", "Asia/Jakarta").forEach { id ->
            TimeZone.setDefault(TimeZone.getTimeZone(id))
            assertEquals("1990-04-23", ArchiveDates.calendarDate(value))
            assertEquals(value, ArchiveDates.parseCalendarDate("1990-04-23"))
        }
    }

    @Test
    fun legacyLocalMidnightStillUsesItsOriginalCalendarDay() {
        listOf("Pacific/Kiritimati", "Pacific/Honolulu").forEach { id ->
            val zone = ZoneId.of(id)
            val legacy = LocalDate.of(1985, 4, 12).atStartOfDay(zone).toInstant()
            assertEquals("1985-04-12", ArchiveDates.calendarDate(legacy, zone))
        }
    }

    @Test
    fun ageUsesTheDeviceCalendarDayWithoutMovingCanonicalBirthDate() {
        val person = Person(
            treeId = "tree",
            displayName = "Rina",
            birthDate = GenealogyDates.fromCalendarDate(LocalDate.of(2000, 8, 1)),
        )
        val reference = Instant.parse("2026-07-31T23:30:00Z")
        TimeZone.setDefault(TimeZone.getTimeZone("Pacific/Kiritimati"))
        assertEquals(26, person.age(reference))
        TimeZone.setDefault(TimeZone.getTimeZone("Pacific/Honolulu"))
        assertEquals(25, person.age(reference))
    }
}
