package tech.robihamanto.heritg.android

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasStateDescription
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.text.AnnotatedString
import androidx.test.espresso.Espresso.pressBack
import org.junit.Rule
import org.junit.Test

class AppFlowTest {
    @get:Rule
    val compose = createAndroidComposeRule<MainActivity>()

    @Test
    fun creationNavigationLanguageEncryptionAndSemantics() {
        compose.waitUntil(5_000) {
            runCatching { compose.onNodeWithTag("trees.create.empty", true).assertIsDisplayed(); true }.getOrDefault(false)
        }
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
        compose.waitUntil(5_000) {
            runCatching { compose.onNode(personNode, true).assertIsDisplayed(); true }.getOrDefault(false)
        }
        compose.onNode(personNode, useUnmergedTree = true).assertIsSelected().assertHasClickAction()
        compose.onAllNodes(personNode, useUnmergedTree = true).assertCountEquals(1)
        compose.onAllNodesWithText("Rina").assertCountEquals(0)
        compose.onNodeWithText(compose.activity.getString(R.string.my_family_tree)).assertDoesNotExist()

        compose.onNodeWithContentDescription(
            compose.activity.getString(R.string.edit_person_named, "Rina"), useUnmergedTree = true,
        ).performClick()
        compose.onNodeWithTag("person.city", true).assertIsDisplayed()
        compose.onNodeWithTag("person.birthDate.add", true).assertIsDisplayed().performClick()
        compose.onNodeWithText(compose.activity.getString(R.string.ok), true).assertIsDisplayed()
        compose.onNodeWithText(compose.activity.getString(R.string.cancel), true).performClick()
        compose.onNodeWithText(compose.activity.getString(R.string.address), true).assertDoesNotExist()
        compose.onNodeWithText(compose.activity.getString(R.string.notes), true).assertDoesNotExist()
        compose.onNodeWithTag("person.nameField", true).performTextReplacement("Rina Rotated")
        compose.activityRule.scenario.recreate()
        compose.waitUntil(5_000) {
            runCatching { compose.onNodeWithTag("person.nameField", true).assertIsDisplayed(); true }.getOrDefault(false)
        }
        compose.onNodeWithTag("person.nameField", true).assertTextEquals("Rina Rotated")
        compose.onNodeWithTag("person.close", true).performClick()
        compose.onNodeWithTag("person.discard.confirm", true).performClick()

        compose.waitUntil(5_000) {
            compose.onAllNodes(hasTestTag("tree.library"), true).fetchSemanticsNodes().isNotEmpty()
        }
        compose.onNodeWithTag("tree.library", true).performClick()
        compose.onNodeWithTag("trees.search", true).assertIsDisplayed()
        pressBack()
        compose.onNodeWithTag("tree.settings", true).assertIsDisplayed()

        compose.onNodeWithTag("tree.generationLimits", true).assertIsNotEnabled()
        compose.onNodeWithTag("tree.settings", true).performClick()
        compose.onNodeWithTag("settings.studioCredit", true).assertExists().assertTextEquals(
            compose.activity.getString(R.string.studio_credit),
        )
        compose.onNodeWithTag("settings.language", true).performClick()
        compose.onNodeWithTag("settings.language.id", true).performClick()
        compose.waitForIdle()
        compose.onNodeWithTag("settings.language.id", true).assertIsSelected()

        pressBack()
        compose.waitUntil(5_000) {
            runCatching { compose.onNodeWithTag("settings.export", true).assertIsDisplayed(); true }.getOrDefault(false)
        }
        compose.onNodeWithTag("settings.export", true).performClick()
        compose.onNodeWithTag("settings.encryptArchive", true).performClick()
        compose.onNodeWithTag("settings.archivePassword", true).performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag("settings.archivePasswordConfirmation", true).performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag("settings.archivePassword", true).performTextReplacement("first")
        compose.onNodeWithTag("settings.archivePasswordConfirmation", true).performTextReplacement("second")
        compose.onNodeWithTag("settings.passwordMismatch", true).performScrollTo().assertIsDisplayed()
        compose.onNodeWithTag("settings.archivePassword", true).performTextReplacement("rotation-secret")
        compose.onNodeWithTag("settings.archivePasswordConfirmation", true).performTextReplacement("rotation-secret")
        compose.activityRule.scenario.recreate()
        compose.waitUntil(5_000) {
            runCatching { compose.onNodeWithTag("settings.archivePassword", true).assertIsDisplayed(); true }.getOrDefault(false)
        }
        val retainedSecret = SemanticsMatcher.expectValue(
            SemanticsProperties.InputText, AnnotatedString("rotation-secret"),
        )
        val sensitive = SemanticsMatcher.expectValue(SemanticsProperties.IsSensitiveData, true)
        compose.onNodeWithTag("settings.archivePassword", true).assert(retainedSecret)
            .assert(sensitive)
        compose.onNodeWithTag("settings.archivePasswordConfirmation", true).assert(retainedSecret)
            .assert(sensitive)
        compose.onNodeWithTag("settings.exportHeritg", true).assertIsDisplayed()
    }
}
