package tech.robihamanto.heritg.android.core.data

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

class AppPreferences(private val dataStore: DataStore<Preferences>) {
    val languageTag: Flow<String?> = dataStore.data.map { it[LanguageTag] }
    val selectedTreeId: Flow<String?> = dataStore.data.map { it[SelectedTreeId] }

    suspend fun setLanguageTag(value: String?) {
        dataStore.edit { preferences ->
            if (value == null) preferences.remove(LanguageTag) else preferences[LanguageTag] = value
        }
    }

    suspend fun setSelectedTreeId(value: String?) {
        dataStore.edit { preferences ->
            if (value == null) preferences.remove(SelectedTreeId) else preferences[SelectedTreeId] = value
        }
    }

    private companion object {
        val LanguageTag = stringPreferencesKey("language_tag")
        val SelectedTreeId = stringPreferencesKey("selected_tree_id")
    }
}
