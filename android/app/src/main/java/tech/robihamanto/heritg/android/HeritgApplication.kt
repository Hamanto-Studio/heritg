package tech.robihamanto.heritg.android

import android.app.Application
import androidx.datastore.preferences.preferencesDataStore
import tech.robihamanto.heritg.android.core.data.AppPreferences
import tech.robihamanto.heritg.android.core.data.FamilyRepository
import tech.robihamanto.heritg.android.core.data.HeritgDatabase

private val Application.dataStore by preferencesDataStore(name = "heritg_preferences")

open class HeritgApplication : Application() {
    val database: HeritgDatabase by lazy { HeritgDatabase.create(this) }
    val familyRepository: FamilyRepository by lazy { FamilyRepository(database) }
    val preferences: AppPreferences by lazy { AppPreferences(dataStore) }
}
