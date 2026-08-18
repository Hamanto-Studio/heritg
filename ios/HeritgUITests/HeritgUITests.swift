//
//  HeritgUITests.swift
//  HeritgUITests
//
//  Created by Hamanto Studio on 28/07/26.
//

import XCTest

final class HeritgUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testImportGEDCOMPresentsFilePicker() throws {
        let app = XCUIApplication()
        app.launchArguments += ["-ui_testing", "-AppleLanguages", "(en)"]
        app.launch()

        let addTree = element("trees.add", in: app)
        XCTAssertTrue(addTree.waitForExistence(timeout: 10))
        addTree.tap()

        let importGEDCOM = element("trees.importGEDCOMMenu", in: app)
        XCTAssertTrue(importGEDCOM.waitForExistence(timeout: 5))
        importGEDCOM.tap()

        let cancelPicker = app.buttons["Cancel"].firstMatch
        guard cancelPicker.waitForExistence(timeout: 5) else {
            XCTFail("Tapping Import GEDCOM did not present the system file picker.\n\(app.debugDescription)")
            return
        }
    }

    @MainActor
    func testAppStoreScreenshots() throws {
        let app = XCUIApplication()
        setupSnapshot(app)
        app.launch()

        let createTree = element("trees.create", in: app)
        XCTAssertTrue(createTree.waitForExistence(timeout: 10))
        createTree.tap()
        let treeNameField = app.alerts.textFields.firstMatch
        XCTAssertTrue(treeNameField.waitForExistence(timeout: 5))
        treeNameField.tap()
        if let currentName = treeNameField.value as? String {
            treeNameField.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: currentName.count))
        }
        treeNameField.typeText("Rina Family")
        app.buttons["trees.create.confirm"].firstMatch.tap()

        let createFirstPerson = element("tree.createFirstPerson", in: app)
        guard createFirstPerson.waitForExistence(timeout: 10) else {
            XCTFail("Create-person control was unavailable.\n\(app.debugDescription)")
            return
        }
        createFirstPerson.tap()
        element("firstPerson.nameField", in: app).typeText("Rina")
        element("firstPerson.save", in: app).tap()

        addRelative(role: "father", name: "Budi", in: app)
        addRelative(role: "mother", name: "Sari", in: app)
        addRelative(role: "partner", name: "Arif", in: app)
        addRelative(role: "daughter", name: "Nadia", in: app)
        addRelative(role: "son", name: "Rafi", in: app)

        XCTAssertTrue(element("tree.people", in: app).waitForExistence(timeout: 5))
        let showAll = element("tree.fit", in: app)
        XCTAssertTrue(showAll.waitForExistence(timeout: 5))
        showAll.tap()
        snapshot("01_FamilyTree")

        element("tree.people", in: app).tap()
        let peopleClose = element("people.close", in: app)
        guard peopleClose.waitForExistence(timeout: 10) else {
            XCTFail("People sheet did not open.\n\(app.debugDescription)")
            return
        }
        snapshot("02_AllPeople")

        peopleClose.tap()
        let editPerson = app.descendants(matching: .any).matching(
            NSPredicate(format: "identifier BEGINSWITH 'person.edit.'")
        ).firstMatch
        XCTAssertTrue(editPerson.waitForExistence(timeout: 5))
        editPerson.tap()
        XCTAssertTrue(element("person.close", in: app).waitForExistence(timeout: 5))
        snapshot("03_PersonDetails")
    }

    @MainActor
    func testLanguageSelectionUpdatesSettingsImmediately() throws {
        let app = XCUIApplication()
        app.launchArguments += ["-ui_testing", "-AppleLanguages", "(en)"]
        app.launch()

        let createTree = element("trees.create", in: app)
        XCTAssertTrue(createTree.waitForExistence(timeout: 10))
        createTree.tap()

        let treeNameField = app.alerts.textFields.firstMatch
        XCTAssertTrue(treeNameField.waitForExistence(timeout: 5))
        treeNameField.typeText("Language Test")
        app.buttons["trees.create.confirm"].firstMatch.tap()

        let settings = element("tree.settings", in: app)
        XCTAssertTrue(settings.waitForExistence(timeout: 10))
        settings.tap()

        let languageRow = element("settings.language", in: app)
        XCTAssertTrue(languageRow.waitForExistence(timeout: 5))
        languageRow.tap()

        let english = element("settings.language.en", in: app)
        let indonesian = element("settings.language.id", in: app)
        XCTAssertTrue(english.waitForExistence(timeout: 5))

        english.tap()
        XCTAssertTrue(english.isSelected)
        XCTAssertTrue(
            app.staticTexts["Choose the language used throughout Heritg."].waitForExistence(timeout: 5)
        )

        app.navigationBars.firstMatch.buttons.firstMatch.tap()
        XCTAssertTrue(languageRow.label.contains("English"))

        languageRow.tap()
        XCTAssertTrue(indonesian.waitForExistence(timeout: 5))

        indonesian.tap()
        XCTAssertTrue(indonesian.isSelected)
        XCTAssertTrue(
            app.staticTexts["Pilih bahasa yang digunakan di seluruh Heritg."].waitForExistence(timeout: 5)
        )

        app.navigationBars.firstMatch.buttons.firstMatch.tap()
        XCTAssertTrue(languageRow.label.contains("Bahasa Indonesia"))

        element("settings.close", in: app).tap()
        XCTAssertTrue(settings.waitForExistence(timeout: 5))
        XCTAssertEqual(settings.label, "Pengaturan")

        let createFirstPerson = element("tree.createFirstPerson", in: app)
        XCTAssertTrue(createFirstPerson.waitForExistence(timeout: 5))
        XCTAssertEqual(createFirstPerson.label, "Tambah orang pertama")
        createFirstPerson.tap()

        let nameField = element("firstPerson.nameField", in: app)
        XCTAssertTrue(nameField.waitForExistence(timeout: 5))
        nameField.typeText("Rina")
        element("firstPerson.save", in: app).tap()

        let personNode = app.descendants(matching: .any).matching(
            NSPredicate(format: "identifier BEGINSWITH 'person.node.'")
        ).firstMatch
        XCTAssertTrue(personNode.waitForExistence(timeout: 10))
        XCTAssertEqual(personNode.value as? String, "Anda")

        let toggleControls = element("tree.toggleControls", in: app)
        XCTAssertTrue(toggleControls.waitForExistence(timeout: 5))
        XCTAssertEqual(toggleControls.label, "Sembunyikan kontrol")
        XCTAssertEqual(toggleControls.value as? String, "Ditampilkan")

        let addButton = app.descendants(matching: .any).matching(
            NSPredicate(format: "identifier BEGINSWITH 'person.add.'")
        ).firstMatch
        XCTAssertTrue(addButton.waitForExistence(timeout: 5))
        addButton.tap()
        app.buttons["relationship.action.add"].firstMatch.tap()

        let fatherRole = element("relative.role.father", in: app)
        XCTAssertTrue(fatherRole.waitForExistence(timeout: 5))
        XCTAssertTrue(fatherRole.label.contains("Ayah"))
        fatherRole.tap()
        let relativeName = element("relative.name", in: app)
        relativeName.tap()
        relativeName.typeText("Budi")
        element("relative.save", in: app).tap()

        let fatherNode = app.descendants(matching: .any).matching(
            NSPredicate(format: "label == 'Budi'")
        ).firstMatch
        XCTAssertTrue(fatherNode.waitForExistence(timeout: 10))
        XCTAssertEqual(fatherNode.value as? String, "Ayah")
    }

    private func addRelative(role: String, name: String, in app: XCUIApplication) {
        let addButton = app.descendants(matching: .any).matching(
            NSPredicate(format: "identifier BEGINSWITH 'person.add.'")
        ).firstMatch
        XCTAssertTrue(addButton.waitForExistence(timeout: 5))
        addButton.tap()
        let addPerson = app.buttons["relationship.action.add"].firstMatch
        XCTAssertTrue(addPerson.waitForExistence(timeout: 5))
        addPerson.tap()

        let roleButton = element("relative.role.\(role)", in: app)
        XCTAssertTrue(roleButton.waitForExistence(timeout: 5))
        roleButton.tap()

        let nameField = element("relative.name", in: app)
        guard nameField.waitForExistence(timeout: 5) else {
            XCTFail("Relative name field was unavailable.\n\(app.debugDescription)")
            return
        }
        nameField.tap()
        nameField.typeText(name)
        let saveButton = element("relative.save", in: app)
        saveButton.tap()
        XCTAssertTrue(saveButton.waitForNonExistence(timeout: 10))
    }

    private func element(_ identifier: String, in app: XCUIApplication) -> XCUIElement {
        let button = app.buttons[identifier]
        if button.exists { return button }

        let textField = app.textFields[identifier]
        if textField.exists { return textField }

        return app.descendants(matching: .any)[identifier]
    }
}
