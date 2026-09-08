package tech.robihamanto.heritg.android

import android.content.res.Configuration
import android.graphics.Bitmap
import android.util.LruCache
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.core.os.ConfigurationCompat
import tech.robihamanto.heritg.android.core.domain.LifeSummary
import tech.robihamanto.heritg.android.core.domain.PersonSnapshot
import tech.robihamanto.heritg.android.core.domain.RelationshipSnapshot
import tech.robihamanto.heritg.android.core.domain.RelativeRole
import tech.robihamanto.heritg.android.core.domain.semanticFormatter
import tech.robihamanto.heritg.android.core.model.FamilyRelationship
import tech.robihamanto.heritg.android.core.model.Person
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.Locale

internal val Configuration.primaryLocale: Locale
    get() = ConfigurationCompat.getLocales(this)[0] ?: Locale.getDefault()

private val LightColors = lightColorScheme(
    primary = Color(0xFF6F5735),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFF3DEBC),
    onPrimaryContainer = Color(0xFF271A08),
    inversePrimary = Color(0xFFD0B486),
    secondary = Color(0xFF51663F),
    onSecondary = Color(0xFFFFFFFF),
    secondaryContainer = Color(0xFFD4E8C1),
    onSecondaryContainer = Color(0xFF13200C),
    tertiary = Color(0xFF755748),
    onTertiary = Color(0xFFFFFFFF),
    tertiaryContainer = Color(0xFFFADDD1),
    onTertiaryContainer = Color(0xFF2B1710),
    background = Color(0xFFF7F3EC),
    onBackground = Color(0xFF302B25),
    surface = Color(0xFFFFFDF8),
    onSurface = Color(0xFF302B25),
    surfaceVariant = Color(0xFFEDE5D8),
    onSurfaceVariant = Color(0xFF4D463D),
    surfaceTint = Color(0xFF6F5735),
    inverseSurface = Color(0xFF38332D),
    inverseOnSurface = Color(0xFFF7F0E7),
    error = Color(0xFF9B3D34),
    onError = Color(0xFFFFFFFF),
    errorContainer = Color(0xFFFFDAD5),
    onErrorContainer = Color(0xFF3D0806),
    outline = Color(0xFF7D7366),
    outlineVariant = Color(0xFFCFC3B3),
    scrim = Color(0xFF000000),
    surfaceBright = Color(0xFFFFFDF8),
    surfaceContainer = Color(0xFFF4F0E9),
    surfaceContainerHigh = Color(0xFFEEEAE3),
    surfaceContainerHighest = Color(0xFFE8E4DD),
    surfaceContainerLow = Color(0xFFFAF6EF),
    surfaceContainerLowest = Color(0xFFFFFFFF),
    surfaceDim = Color(0xFFDED8D0),
    primaryFixed = Color(0xFFF3DEBC),
    primaryFixedDim = Color(0xFFD6C19F),
    onPrimaryFixed = Color(0xFF271A08),
    onPrimaryFixedVariant = Color(0xFF584522),
    secondaryFixed = Color(0xFFD4E8C1),
    secondaryFixedDim = Color(0xFFB8CCAA),
    onSecondaryFixed = Color(0xFF13200C),
    onSecondaryFixedVariant = Color(0xFF3A512E),
    tertiaryFixed = Color(0xFFFADDD1),
    tertiaryFixedDim = Color(0xFFDDBFB3),
    onTertiaryFixed = Color(0xFF2B1710),
    onTertiaryFixedVariant = Color(0xFF5C4035),
)

private val DarkColors = darkColorScheme(
    primary = Color(0xFFD0B486),
    onPrimary = Color(0xFF35260D),
    primaryContainer = Color(0xFF55411D),
    onPrimaryContainer = Color(0xFFF3DEBC),
    inversePrimary = Color(0xFF6F5735),
    secondary = Color(0xFFA9C28A),
    onSecondary = Color(0xFF1D3012),
    secondaryContainer = Color(0xFF344B28),
    onSecondaryContainer = Color(0xFFD4E8C1),
    tertiary = Color(0xFFDAB9AA),
    onTertiary = Color(0xFF3E291F),
    tertiaryContainer = Color(0xFF573B31),
    onTertiaryContainer = Color(0xFFFADDD1),
    background = Color(0xFF1C1915),
    onBackground = Color(0xFFF1EAE1),
    surface = Color(0xFF1C1915),
    onSurface = Color(0xFFF1EAE1),
    surfaceVariant = Color(0xFF463E33),
    onSurfaceVariant = Color(0xFFD4C8B8),
    surfaceTint = Color(0xFFD0B486),
    inverseSurface = Color(0xFFE8E1D8),
    inverseOnSurface = Color(0xFF38332D),
    error = Color(0xFFFFB4AA),
    onError = Color(0xFF5F160F),
    errorContainer = Color(0xFF7D2E26),
    onErrorContainer = Color(0xFFFFDAD5),
    outline = Color(0xFF9B8F80),
    outlineVariant = Color(0xFF5B5145),
    scrim = Color(0xFF000000),
    surfaceBright = Color(0xFF403A33),
    surfaceContainer = Color(0xFF29251F),
    surfaceContainerHigh = Color(0xFF342F28),
    surfaceContainerHighest = Color(0xFF403A33),
    surfaceContainerLow = Color(0xFF241F1A),
    surfaceContainerLowest = Color(0xFF100E0B),
    surfaceDim = Color(0xFF15120F),
    primaryFixed = Color(0xFFF3DEBC),
    primaryFixedDim = Color(0xFFD6C19F),
    onPrimaryFixed = Color(0xFF271A08),
    onPrimaryFixedVariant = Color(0xFF584522),
    secondaryFixed = Color(0xFFD4E8C1),
    secondaryFixedDim = Color(0xFFB8CCAA),
    onSecondaryFixed = Color(0xFF13200C),
    onSecondaryFixedVariant = Color(0xFF3A512E),
    tertiaryFixed = Color(0xFFFADDD1),
    tertiaryFixedDim = Color(0xFFDDBFB3),
    onTertiaryFixed = Color(0xFF2B1710),
    onTertiaryFixedVariant = Color(0xFF5C4035),
)

@Composable
fun HeritgTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (isSystemInDarkTheme()) DarkColors else LightColors,
        content = content,
    )
}

@Composable
fun Avatar(person: Person, size: Dp = 48.dp) {
    val maximum = with(LocalDensity.current) { size.roundToPx() }
    val bitmap by rememberPhotoThumbnail(person.id, person.profilePhotoData, maximum)
    Box(Modifier.size(size).clip(CircleShape).background(MaterialTheme.colorScheme.surfaceVariant), contentAlignment = Alignment.Center) {
        bitmap?.let { photo -> Image(photo.asImageBitmap(), stringResource(R.string.profile_photo_of, person.displayName),
            Modifier.size(size), contentScale = ContentScale.Crop) }
            ?: Text(person.displayName.take(1).uppercase())
    }
}

@Composable
internal fun rememberPhotoThumbnail(id: String, data: ByteArray?, maximum: Int): State<Bitmap?> {
    return produceState<Bitmap?>(null, id, data, maximum) {
        value = if (data == null) null else withContext(Dispatchers.Default) {
            val key = "$id:${data.contentHashCode()}:$maximum"
            ThumbnailCache.get(key) ?: PhotoTools.decode(data, maximum.coerceAtLeast(1))?.also {
                ThumbnailCache.put(key, it)
            }
        }
    }
}

private object ThumbnailCache : LruCache<String, Bitmap>(16 * 1024) {
    override fun sizeOf(key: String, value: Bitmap): Int = value.allocationByteCount / 1024
}

fun List<Person>.snapshots(locale: Locale = Locale.getDefault()): List<PersonSnapshot> {
    val formatter = semanticFormatter(locale)
    return map { person -> PersonSnapshot(
        id = person.id, name = person.displayName, gender = person.gender,
        profilePhotoData = person.profilePhotoData,
        lifeSummary = LifeSummary.summary(person, formatter),
        birthEpochMillis = person.birthDate?.toEpochMilli(),
    ) }
}

fun List<FamilyRelationship>.snapshots() = map { relationship -> RelationshipSnapshot(
    id = relationship.id, fromPersonId = relationship.fromPersonId, toPersonId = relationship.toPersonId,
    kind = relationship.kind, subtype = relationship.subtype, marriageYear = relationship.marriageYear,
) }

@Composable
fun roleTitle(role: RelativeRole): String = stringResource(when (role) {
    RelativeRole.FATHER -> R.string.father; RelativeRole.MOTHER -> R.string.mother
    RelativeRole.BROTHER -> R.string.brother; RelativeRole.SISTER -> R.string.sister
    RelativeRole.PARTNER -> R.string.partner; RelativeRole.SON -> R.string.son
    RelativeRole.DAUGHTER -> R.string.daughter; RelativeRole.ADOPTIVE_FATHER -> R.string.adoptive_father
    RelativeRole.ADOPTIVE_MOTHER -> R.string.adoptive_mother; RelativeRole.FOSTER_FATHER -> R.string.foster_father
    RelativeRole.FOSTER_MOTHER -> R.string.foster_mother; RelativeRole.GUARDIAN -> R.string.guardian
    RelativeRole.STEPFATHER -> R.string.stepfather; RelativeRole.STEPMOTHER -> R.string.stepmother
    RelativeRole.HALF_BROTHER -> R.string.half_brother; RelativeRole.HALF_SISTER -> R.string.half_sister
    RelativeRole.ADOPTIVE_BROTHER -> R.string.adoptive_brother; RelativeRole.ADOPTIVE_SISTER -> R.string.adoptive_sister
    RelativeRole.FOSTER_BROTHER -> R.string.foster_brother; RelativeRole.FOSTER_SISTER -> R.string.foster_sister
    RelativeRole.STEPBROTHER -> R.string.stepbrother; RelativeRole.STEPSISTER -> R.string.stepsister
    RelativeRole.HUSBAND -> R.string.husband; RelativeRole.WIFE -> R.string.wife
    RelativeRole.FORMER_PARTNER -> R.string.former_partner; RelativeRole.FORMER_HUSBAND -> R.string.former_husband
    RelativeRole.FORMER_WIFE -> R.string.former_wife; RelativeRole.ADOPTIVE_SON -> R.string.adoptive_son
    RelativeRole.ADOPTIVE_DAUGHTER -> R.string.adoptive_daughter; RelativeRole.FOSTER_SON -> R.string.foster_son
    RelativeRole.FOSTER_DAUGHTER -> R.string.foster_daughter; RelativeRole.WARD -> R.string.ward
    RelativeRole.STEPSON -> R.string.stepson; RelativeRole.STEPDAUGHTER -> R.string.stepdaughter
})
