package tech.robihamanto.heritg.android.core.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [FamilyTreeEntity::class, PersonEntity::class, FamilyRelationshipEntity::class],
    version = 1,
    exportSchema = true,
)
abstract class HeritgDatabase : RoomDatabase() {
    abstract fun familyDao(): FamilyDao

    companion object {
        fun create(context: Context): HeritgDatabase = Room.databaseBuilder(
            context.applicationContext,
            HeritgDatabase::class.java,
            "heritg.db",
        ).build()
    }
}
