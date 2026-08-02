package tech.robihamanto.heritg.android.core.data

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import tech.robihamanto.heritg.android.core.model.BirthDatePrecision
import tech.robihamanto.heritg.android.core.model.FamilyRelationship
import tech.robihamanto.heritg.android.core.model.FamilyTree
import tech.robihamanto.heritg.android.core.model.Person
import tech.robihamanto.heritg.android.core.model.PersonGender
import tech.robihamanto.heritg.android.core.model.RelationshipKind
import tech.robihamanto.heritg.android.core.model.RelationshipSubtype
import java.time.Instant

@Entity(tableName = "family_trees")
data class FamilyTreeEntity(
    @PrimaryKey val id: String,
    val title: String,
    val createdAtEpochMillis: Long,
    val updatedAtEpochMillis: Long,
    val lastSelectedPersonId: String?,
)

@Entity(
    tableName = "people",
    foreignKeys = [ForeignKey(
        entity = FamilyTreeEntity::class,
        parentColumns = ["id"],
        childColumns = ["treeId"],
        onDelete = ForeignKey.CASCADE,
    )],
    indices = [Index("treeId")],
)
data class PersonEntity(
    @PrimaryKey val id: String,
    val treeId: String,
    val displayName: String,
    val genderRaw: String,
    val createdAtEpochMillis: Long,
    val birthDateEpochMillis: Long?,
    val deathDateEpochMillis: Long?,
    val birthDatePrecisionRaw: String,
    val notes: String,
    val addressLine: String,
    val city: String,
    val province: String,
    val country: String,
    val postalCode: String,
    val profilePhotoData: ByteArray?,
)

@Entity(
    tableName = "family_relationships",
    foreignKeys = [
        ForeignKey(
            entity = FamilyTreeEntity::class,
            parentColumns = ["id"],
            childColumns = ["treeId"],
            onDelete = ForeignKey.CASCADE,
        ),
        ForeignKey(
            entity = PersonEntity::class,
            parentColumns = ["id"],
            childColumns = ["fromPersonId"],
            onDelete = ForeignKey.CASCADE,
        ),
        ForeignKey(
            entity = PersonEntity::class,
            parentColumns = ["id"],
            childColumns = ["toPersonId"],
            onDelete = ForeignKey.CASCADE,
        ),
    ],
    indices = [
        Index("treeId"),
        Index("fromPersonId"),
        Index("toPersonId"),
        Index(value = ["treeId", "kindRaw", "fromPersonId", "toPersonId"], unique = true),
    ],
)
data class FamilyRelationshipEntity(
    @PrimaryKey val id: String,
    val treeId: String,
    val fromPersonId: String,
    val toPersonId: String,
    val kindRaw: String,
    val subtypeRaw: String,
    val createdAtEpochMillis: Long,
    val marriageDateEpochMillis: Long?,
)

internal fun FamilyTree.toEntity() = FamilyTreeEntity(
    id, title, createdAt.toEpochMilli(), updatedAt.toEpochMilli(), lastSelectedPersonId,
)

internal fun FamilyTreeEntity.toModel() = FamilyTree(
    id, title, Instant.ofEpochMilli(createdAtEpochMillis), Instant.ofEpochMilli(updatedAtEpochMillis),
    lastSelectedPersonId,
)

internal fun Person.toEntity() = PersonEntity(
    id, treeId, displayName, gender.wireName, createdAt.toEpochMilli(), birthDate?.toEpochMilli(),
    deathDate?.toEpochMilli(), birthDatePrecision.wireName, notes, addressLine, city, province,
    country, postalCode, profilePhotoData,
)

internal fun PersonEntity.toModel() = Person(
    id = id,
    treeId = treeId,
    displayName = displayName,
    gender = PersonGender.fromWire(genderRaw) ?: PersonGender.UNSPECIFIED,
    createdAt = Instant.ofEpochMilli(createdAtEpochMillis),
    birthDate = birthDateEpochMillis?.let(Instant::ofEpochMilli),
    deathDate = deathDateEpochMillis?.let(Instant::ofEpochMilli),
    birthDatePrecision = BirthDatePrecision.fromWire(birthDatePrecisionRaw) ?: BirthDatePrecision.EXACT,
    notes = notes,
    addressLine = addressLine,
    city = city,
    province = province,
    country = country,
    postalCode = postalCode,
    profilePhotoData = profilePhotoData,
)

internal fun FamilyRelationship.toEntity() = FamilyRelationshipEntity(
    id, treeId, fromPersonId, toPersonId, kind.wireName, subtype.wireName, createdAt.toEpochMilli(),
    marriageDate?.toEpochMilli(),
)

internal fun FamilyRelationshipEntity.toModel() = FamilyRelationship(
    id = id,
    treeId = treeId,
    fromPersonId = fromPersonId,
    toPersonId = toPersonId,
    kind = RelationshipKind.fromWire(kindRaw) ?: RelationshipKind.PARENT,
    subtype = RelationshipSubtype.fromWire(subtypeRaw) ?: RelationshipSubtype.BIOLOGICAL_PARENT,
    createdAt = Instant.ofEpochMilli(createdAtEpochMillis),
    marriageDate = marriageDateEpochMillis?.let(Instant::ofEpochMilli),
)
