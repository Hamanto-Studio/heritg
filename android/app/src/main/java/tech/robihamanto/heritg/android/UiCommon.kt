package tech.robihamanto.heritg.android

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

val Ink = Color(0xFF20342E)
val Moss = Color(0xFF476B58)
val Paper = Color(0xFFF4EFE4)
val Card = Color(0xFFFFFCF4)
val Recessed = Color(0xFFE8E6DC)
val Line = Color(0xFFCBCBC0)
val Danger = Color(0xFF9B3D34)

@Composable
fun HeritgTheme(content: @Composable () -> Unit) {
    val colors = if (isSystemInDarkTheme()) darkColorScheme(
        primary = Color(0xFF9BC7AC), onPrimary = Color(0xFF163426),
        secondary = Color(0xFFA9C28A), onSecondary = Color.White,
        tertiary = Color(0xFFD0B486), onTertiary = Color.White,
        background = Color(0xFF111814), surface = Color(0xFF1A241E),
        surfaceVariant = Color(0xFF27332C), onBackground = Color(0xFFE1EAE3),
        onSurface = Color(0xFFE1EAE3), error = Color(0xFFFFB4AB),
    ) else lightColorScheme(
        primary = Moss, onPrimary = Color.White, background = Paper, surface = Card,
        secondary = Color(0xFF7E9B63), onSecondary = Color.White,
        tertiary = Color(0xFFA8875B), onTertiary = Color.White,
        surfaceVariant = Recessed, onBackground = Ink, onSurface = Ink, error = Danger,
    )
    MaterialTheme(
        colorScheme = colors,
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
