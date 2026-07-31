package tech.robihamanto.heritg.android

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasStateDescription
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextReplacement
import org.junit.Rule
import org.junit.Test

class AppFlowTest {
    @get:Rule
    val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun creationNavigationLanguageEncryptionAndSemantics() {
        compose.onNodeWithTag("trees.create.empty", useUnmergedTree = true).performClick()
        compose.onNodeWithTag("trees.create.confirm", useUnmergedTree = true).assertIsEnabled().performClick()
        compose.waitUntil(5_000) {
            runCatching { compose.onNodeWithTag("tree.createFirstPerson", true).assertIsDisplayed(); true }.getOrDefault(false)
        }
        compose.onNodeWithTag("tree.createFirstPerson", true).performClick()
        compose.onNodeWithTag("firstPerson.nameField", true).performTextReplacement("Rina")
        compose.onNodeWithTag("firstPerson.save", true).performClick()
        compose.waitUntil(5_000) {
            runCatching { compose.onNodeWithTag("tree.settings", true).assertIsDisplayed(); true }.getOrDefault(false)
        }
        val selectedRole = compose.activity.getString(R.string.you)
        val personNode = hasContentDescription("Rina") and hasStateDescription(selectedRole) and hasClickAction()
        compose.onNode(personNode, useUnmergedTree = true).assertIsSelected().assertHasClickAction()
        compose.onAllNodes(personNode, useUnmergedTree = true).assertCountEquals(1)
        compose.onAllNodesWithText("Rina", useUnmergedTree = true).assertCountEquals(0)

        compose.onNodeWithContentDescription(
            compose.activity.getString(R.string.edit_person_named, "Rina"), useUnmergedTree = true,
        ).performClick()
        compose.onNodeWithTag("person.nameField", true).performTextReplacement("Rina Rotated")
        compose.activityRule.scenario.recreate()
        compose.waitUntil(5_000) {
            runCatching { compose.onNodeWithTag("person.nameField", true).assertIsDisplayed(); true }.getOrDefault(false)
        }
        compose.onNodeWithTag("person.nameField", true).assertTextEquals("Rina Rotated")
        compose.onNodeWithTag("person.close", true).performClick()
        compose.onNodeWithTag("person.discard.confirm", true).performClick()

        compose.onNodeWithTag("tree.generationLimits", true).assertIsNotEnabled()
        compose.onNodeWithTag("tree.settings", true).performClick()
        compose.onNodeWithTag("settings.language", true).performClick()
        compose.onNodeWithTag("settings.language.id", true).performClick()
        compose.waitForIdle()
        compose.onNodeWithTag("settings.language.id", true).assertIsSelected()

        compose.activityRule.scenario.onActivity { it.onBackPressedDispatcher.onBackPressed() }
        compose.waitUntil(5_000) {
            runCatching { compose.onNodeWithTag("tree.settings", true).assertIsDisplayed(); true }.getOrDefault(false)
        }
        compose.onNodeWithTag("tree.settings", true).performClick()
        compose.onNodeWithTag("settings.export", true).performClick()
        compose.onNodeWithTag("settings.encryptArchive", true).performClick()
        compose.onNodeWithTag("settings.archivePassword", true).assertIsDisplayed()
        compose.onNodeWithTag("settings.archivePasswordConfirmation", true).assertIsDisplayed()
        compose.onNodeWithTag("settings.archivePassword", true).performTextReplacement("first")
        compose.onNodeWithTag("settings.archivePasswordConfirmation", true).performTextReplacement("second")
        compose.onNodeWithTag("settings.passwordMismatch", true).assertIsDisplayed()
        compose.onNodeWithTag("settings.archivePassword", true).performTextReplacement("rotation-secret")
        compose.onNodeWithTag("settings.archivePasswordConfirmation", true).performTextReplacement("rotation-secret")
        compose.activityRule.scenario.recreate()
        compose.waitUntil(5_000) {
            runCatching { compose.onNodeWithTag("settings.archivePassword", true).assertIsDisplayed(); true }.getOrDefault(false)
        }
        compose.onNodeWithTag("settings.archivePassword", true).assertTextEquals("rotation-secret")
        compose.onNodeWithTag("settings.archivePasswordConfirmation", true).assertTextEquals("rotation-secret")
        compose.onNodeWithTag("settings.exportHeritg", true).assertIsDisplayed()
    }
}
