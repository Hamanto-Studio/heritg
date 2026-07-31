package tech.robihamanto.heritg.android.core.data

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface FamilyDao {
    @Query("SELECT * FROM family_trees ORDER BY updatedAtEpochMillis DESC, id ASC")
    fun observeTrees(): Flow<List<FamilyTreeEntity>>

    @Query("SELECT COUNT(*) FROM family_trees")
    fun observeTreeCount(): Flow<Int>

    @Query("SELECT * FROM family_trees WHERE id = :id")
    suspend fun tree(id: String): FamilyTreeEntity?

    @Query("SELECT * FROM people WHERE id = :id")
    suspend fun person(id: String): PersonEntity?

    @Query("SELECT * FROM family_relationships WHERE id = :id")
    suspend fun relationship(id: String): FamilyRelationshipEntity?

    @Query("SELECT * FROM people WHERE treeId = :treeId ORDER BY createdAtEpochMillis, id")
    suspend fun people(treeId: String): List<PersonEntity>

    @Query("SELECT * FROM family_relationships WHERE treeId = :treeId ORDER BY createdAtEpochMillis, id")
    suspend fun relationships(treeId: String): List<FamilyRelationshipEntity>

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertTree(tree: FamilyTreeEntity)

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertPeople(people: List<PersonEntity>)

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertRelationships(relationships: List<FamilyRelationshipEntity>)

    @Update
    suspend fun updateTree(tree: FamilyTreeEntity)

    @Update
    suspend fun updatePerson(person: PersonEntity)

    @Delete
    suspend fun deleteTree(tree: FamilyTreeEntity)

    @Delete
    suspend fun deletePerson(person: PersonEntity)

    @Delete
    suspend fun deleteRelationship(relationship: FamilyRelationshipEntity)
}
