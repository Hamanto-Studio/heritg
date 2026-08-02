package tech.robihamanto.heritg.android

import android.app.Application
import android.content.Context
import androidx.test.runner.AndroidJUnitRunner
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking

class HeritgTestRunner : AndroidJUnitRunner() {
    override fun newApplication(classLoader: ClassLoader?, className: String?, context: Context?): Application {
        return super.newApplication(classLoader, HeritgApplication::class.java.name, context)
    }

    override fun onStart() {
        val application = targetContext.applicationContext as HeritgApplication
        runBlocking {
            application.familyRepository.observeTrees().first().forEach {
                application.familyRepository.deleteTree(it.id)
            }
            application.preferences.setSelectedTreeId(null)
        }
        super.onStart()
    }
}
