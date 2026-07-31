package tech.robihamanto.heritg.android

import android.content.Context
import tech.robihamanto.heritg.android.core.domain.FamilyGraphException
import tech.robihamanto.heritg.android.core.interop.ArchiveException
import tech.robihamanto.heritg.android.core.interop.GedcomException
import java.io.IOException
import java.time.format.DateTimeParseException

sealed class LocalFileException : IOException() {
    data object TooLarge : LocalFileException()
    data object OpenFailed : LocalFileException()
    data object WrongExtension : LocalFileException()
}

sealed class PhotoEditException : IllegalArgumentException() {
    data object InvalidImage : PhotoEditException()
    data object CropFailed : PhotoEditException()
}

fun Context.localizedError(error: Throwable): String = when (error) {
    FamilyGraphException.EmptyName -> getString(R.string.error_enter_name)
    FamilyGraphException.SelfRelationship -> getString(R.string.error_self_relationship)
    FamilyGraphException.DuplicateRelationship -> getString(R.string.error_duplicate_relationship)
    FamilyGraphException.DeathBeforeBirth -> getString(R.string.error_death_before_birth)
    FamilyGraphException.CrossTreeRelationship -> getString(R.string.error_cross_tree_relationship)
    FamilyGraphException.InvalidCoParent -> getString(R.string.error_invalid_co_parent)
    FamilyGraphException.InvalidGraph -> getString(R.string.error_invalid_graph)
    is GedcomException.EmptyFile -> getString(R.string.error_gedcom_empty)
    is GedcomException.FileTooLarge -> getString(R.string.error_gedcom_too_large)
    is GedcomException.MalformedLine -> getString(R.string.error_gedcom_malformed, error.line)
    is GedcomException.TooManyRecords -> getString(R.string.error_gedcom_records)
    is GedcomException.NoPeople -> getString(R.string.error_gedcom_no_people)
    is ArchiveException.FileTooLarge -> getString(R.string.error_archive_too_large)
    is ArchiveException.InvalidArchive -> getString(R.string.error_archive_invalid)
    is ArchiveException.UnsupportedVersion -> getString(R.string.error_archive_version)
    is ArchiveException.WrongPasswordOrCorrupt -> getString(R.string.error_archive_password)
    is ArchiveException.TooManyRecords -> getString(R.string.error_archive_records)
    is ArchiveException.FieldTooLarge -> getString(R.string.error_archive_field)
    is ArchiveException.MediaTooLarge -> getString(R.string.error_archive_media)
    is ArchiveException.IdentifierCollision -> getString(R.string.error_archive_collision)
    LocalFileException.TooLarge -> getString(R.string.error_file_too_large)
    LocalFileException.OpenFailed -> getString(R.string.error_file_open)
    LocalFileException.WrongExtension -> getString(R.string.error_archive_extension)
    PhotoEditException.InvalidImage -> getString(R.string.error_photo_open)
    PhotoEditException.CropFailed -> getString(R.string.error_photo_crop)
    is DateTimeParseException -> getString(R.string.error_invalid_date)
    else -> error.localizedMessage?.takeIf { it.isNotBlank() } ?: getString(R.string.error_unknown)
}

fun Context.localizedGedcomWarning(warning: String): String {
    Regex("Duplicate person record @(.+)@ was ignored\\.").matchEntire(warning)?.let {
        return getString(R.string.warning_duplicate_person, it.groupValues[1])
    }
    Regex("A date for (.+) could not be imported: (.*)").matchEntire(warning)?.let {
        return getString(R.string.warning_date_not_imported, it.groupValues[1], it.groupValues[2])
    }
    Regex("A place for (.+) was not imported because event places are not supported yet\\.")
        .matchEntire(warning)?.let {
            return getString(R.string.warning_place_not_imported, it.groupValues[1])
        }
    return warning
}
