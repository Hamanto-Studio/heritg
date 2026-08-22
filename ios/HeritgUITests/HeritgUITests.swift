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
        XCUIDevice.shared.orientation = .portrait
    }

    @MainActor
    func testImportGEDCOMPresentsFilePicker() throws {
        let app = XCUIApplication()
        app.launchArguments += ["-ui_testing", "-AppleLanguages", "(en)"]
        app.launch()

        let importGEDCOM = element("trees.import", in: app)
        XCTAssertTrue(importGEDCOM.waitForExistence(timeout: 10))
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
        XCTAssertTrue(peopleClose.waitForNonExistence(timeout: 5))
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
        XCTAssertEqual(personNode.value as? String, "Orang terpilih")

        let toggleControls = element("tree.toggleControls", in: app)
        XCTAssertTrue(toggleControls.waitForExistence(timeout: 5))
        XCTAssertEqual(toggleControls.label, "Sembunyikan kontrol")
        XCTAssertEqual(toggleControls.value as? String, "Ditampilkan")

        let addButton = app.buttons.matching(
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

        let fatherNode = app.buttons.matching(
            NSPredicate(format: "label == 'Budi'")
        ).firstMatch
        XCTAssertTrue(fatherNode.waitForExistence(timeout: 10))
        XCTAssertEqual(fatherNode.value as? String, "Ayah")
    }

    @MainActor
    func testSettingsSharePageOpensWithoutEagerPreparation() throws {
        let app = XCUIApplication()
        app.launchArguments += [
            "-ui_testing",
            "-AppleLanguages", "(en)",
            "-appLanguage", "en",
        ]
        app.launch()

        element("trees.create", in: app).tap()
        let treeName = app.alerts.textFields.firstMatch
        XCTAssertTrue(treeName.waitForExistence(timeout: 5))
        treeName.typeText("Share Test")
        app.buttons["trees.create.confirm"].firstMatch.tap()

        let settings = element("tree.settings", in: app)
        XCTAssertTrue(settings.waitForExistence(timeout: 10))
        settings.tap()

        let share = element("settings.share", in: app)
        XCTAssertTrue(share.waitForExistence(timeout: 5))
        XCTAssertTrue(share.label.contains("Share"))
        share.tap()

        let backupMethod = element("settings.shareMethod.heritg", in: app)
        XCTAssertTrue(
            backupMethod.waitForExistence(timeout: 2),
            "The Share chooser did not become responsive promptly.\n\(app.debugDescription)"
        )
        XCTAssertTrue(backupMethod.isSelected)
        XCTAssertTrue(element("settings.shareHeritg", in: app).waitForExistence(timeout: 2))
        XCTAssertFalse(app.staticTexts["Preparing HERITG backup..."].exists)
    }

    @MainActor
    func testShareActionsPresentSystemShareSheet() throws {
        let app = XCUIApplication()
        app.launchArguments += [
            "-ui_testing",
            "-AppleLanguages", "(en)",
            "-appLanguage", "en",
        ]

        let shareCases = [
            (method: "heritg", action: "settings.shareHeritg", needsPerson: false),
            (method: "gedcom", action: "settings.shareGEDCOM", needsPerson: false),
            (method: "images", action: "settings.sharePNG", needsPerson: true),
            (method: "images", action: "settings.shareSVG", needsPerson: true),
        ]

        for shareCase in shareCases {
            app.launch()

            element("trees.create", in: app).tap()
            let treeName = app.alerts.textFields.firstMatch
            XCTAssertTrue(treeName.waitForExistence(timeout: 5))
            treeName.typeText("Share Actions Test")
            app.buttons["trees.create.confirm"].firstMatch.tap()

            if shareCase.needsPerson {
                let createFirstPerson = element("tree.createFirstPerson", in: app)
                XCTAssertTrue(createFirstPerson.waitForExistence(timeout: 10))
                createFirstPerson.tap()
                element("firstPerson.nameField", in: app).typeText("Rina")
                element("firstPerson.save", in: app).tap()
            }

            let settings = element("tree.settings", in: app)
            XCTAssertTrue(settings.waitForExistence(timeout: 10))
            settings.tap()
            let share = element("settings.share", in: app)
            XCTAssertTrue(share.waitForExistence(timeout: 5))
            share.tap()
            XCTAssertTrue(element("settings.shareMethod.heritg", in: app).waitForExistence(timeout: 2))

            shareFile(method: shareCase.method, action: shareCase.action, in: app)
            app.terminate()
        }
    }

    @MainActor
    func testTreeActionsOpenTheirIntendedDestination() throws {
        let app = XCUIApplication()
        app.launchArguments += [
            "-ui_testing",
            "-AppleLanguages", "(en)",
            "-appLanguage", "en",
        ]
        app.launch()

        let createTree = element("trees.create", in: app)
        XCTAssertTrue(createTree.waitForExistence(timeout: 10))
        createTree.tap()
        let treeNameField = app.alerts.textFields.firstMatch
        XCTAssertTrue(treeNameField.waitForExistence(timeout: 5))
        treeNameField.typeText("Action Test")
        app.buttons["trees.create.confirm"].firstMatch.tap()

        let createFirstPerson = element("tree.createFirstPerson", in: app)
        XCTAssertTrue(createFirstPerson.waitForExistence(timeout: 10))
        createFirstPerson.tap()
        element("firstPerson.nameField", in: app).typeText("Rina")
        element("firstPerson.save", in: app).tap()

        addRelative(role: "father", name: "Budi", in: app)

        let personNode = app.buttons.matching(NSPredicate(format: "label == 'Budi'")).firstMatch
        XCTAssertTrue(personNode.waitForExistence(timeout: 10))
        XCTAssertEqual(personNode.value as? String, "Father")

        let originalFrame = personNode.frame
        let dragStart = app.coordinate(withNormalizedOffset: CGVector(dx: 0.15, dy: 0.75))
        let dragEnd = app.coordinate(withNormalizedOffset: CGVector(dx: 0.35, dy: 0.75))
        dragStart.press(forDuration: 0.05, thenDragTo: dragEnd)
        XCTAssertGreaterThan(abs(personNode.frame.midX - originalFrame.midX), 40)
        element("tree.fit", in: app).tap()

        personNode.tap()
        XCTAssertEqual(personNode.value as? String, "Selected person")
        XCTAssertFalse(app.textFields["person.nameField"].firstMatch.exists)

        let zoomOut = element("tree.zoomOut", in: app)
        for _ in 0..<6 { zoomOut.tap() }

        let personID = personNode.identifier.replacingOccurrences(of: "person.node.", with: "")
        let editButton = app.buttons["person.edit.\(personID)"].firstMatch
        XCTAssertTrue(editButton.waitForExistence(timeout: 5))
        XCTAssertTrue(editButton.isHittable, "Edit button is not hittable.\n\(app.debugDescription)")
        editButton.tap()
        let editedPersonName = app.textFields["person.nameField"].firstMatch
        XCTAssertTrue(editedPersonName.waitForExistence(timeout: 5))
        XCTAssertEqual(editedPersonName.value as? String, "Budi")
        element("person.close", in: app).tap()

        let addButton = app.buttons["person.add.\(personID)"].firstMatch
        XCTAssertTrue(addButton.waitForExistence(timeout: 5))
        addButton.tap()
        XCTAssertTrue(app.buttons["relationship.action.add"].waitForExistence(timeout: 5))
        XCTAssertFalse(element("person.close", in: app).exists)
    }

    @MainActor
    func testManualChildOrderCanBeCreatedEditedAndCleared() throws {
        let app = XCUIApplication()
        app.launchArguments += [
            "-ui_testing",
            "-AppleLanguages", "(en)",
            "-appLanguage", "en",
        ]
        app.launch()

        element("trees.create", in: app).tap()
        let treeName = app.alerts.textFields.firstMatch
        XCTAssertTrue(treeName.waitForExistence(timeout: 5))
        treeName.typeText("Child Order Test")
        app.buttons["trees.create.confirm"].firstMatch.tap()

        let createFirstPerson = element("tree.createFirstPerson", in: app)
        XCTAssertTrue(createFirstPerson.waitForExistence(timeout: 10))
        createFirstPerson.tap()
        element("firstPerson.nameField", in: app).typeText("Rina")
        let firstOrder = element("firstPerson.childOrder", in: app)
        firstOrder.tap()
        firstOrder.typeText("2")
        element("firstPerson.save", in: app).tap()

        let personNode = app.buttons.matching(
            NSPredicate(format: "identifier BEGINSWITH 'person.node.'")
        ).firstMatch
        XCTAssertTrue(personNode.waitForExistence(timeout: 10))
        XCTAssertTrue((personNode.value as? String)?.contains("Second child") == true)

        let personID = personNode.identifier.replacingOccurrences(of: "person.node.", with: "")
        element("person.edit.\(personID)", in: app).tap()
        let orderField = element("person.childOrder", in: app)
        XCTAssertTrue(orderField.waitForExistence(timeout: 5))
        XCTAssertEqual(orderField.value as? String, "2")
        orderField.tap()
        orderField.typeText(XCUIKeyboardKey.delete.rawValue)
        orderField.typeText("0")
        element("person.save", in: app).tap()
        XCTAssertTrue(element("person.error", in: app).waitForExistence(timeout: 5))

        orderField.tap()
        orderField.typeText(XCUIKeyboardKey.delete.rawValue)
        element("person.save", in: app).tap()
        XCTAssertTrue(orderField.waitForNonExistence(timeout: 5))
        XCTAssertFalse((personNode.value as? String)?.contains("Second child") == true)
    }

    private func addRelative(role: String, name: String, in app: XCUIApplication) {
        let addButton = app.buttons.matching(
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

    private func shareFile(method: String, action: String, in app: XCUIApplication) {
        let methodButton = element("settings.shareMethod.\(method)", in: app)
        XCTAssertTrue(methodButton.isHittable)
        methodButton.tap()

        let actionButton = app.buttons[action].firstMatch
        if !actionButton.waitForExistence(timeout: 2) {
            app.scrollViews.firstMatch.swipeUp()
            XCTAssertTrue(methodButton.isHittable)
            methodButton.tap()
        }
        XCTAssertTrue(
            actionButton.waitForExistence(timeout: 2),
            "Selecting \(method) did not show \(action).\n\(app.debugDescription)"
        )
        let visibleFrame = app.frame.insetBy(dx: 0, dy: 20)
        for _ in 0..<5 where !visibleFrame.contains(
            CGPoint(x: actionButton.frame.midX, y: actionButton.frame.midY)
        ) {
            app.scrollViews.firstMatch.swipeUp()
        }
        XCTAssertTrue(actionButton.isHittable)
        XCTAssertTrue(visibleFrame.contains(CGPoint(x: actionButton.frame.midX, y: actionButton.frame.midY)))
        actionButton.tap()

        let localActivityList = app.otherElements["ActivityListView"]
        let shareUI = XCUIApplication(bundleIdentifier: "com.apple.UIKit.ShareUI")
        let remoteActivityList = shareUI.otherElements["ActivityListView"]
        let activityList: XCUIElement
        let shareHost: XCUIApplication
        if localActivityList.waitForExistence(timeout: 8) {
            activityList = localActivityList
            shareHost = app
        } else {
            XCTAssertTrue(
                remoteActivityList.waitForExistence(timeout: 7),
                "Sharing \(action) did not present the system share sheet.\nApp:\n\(app.debugDescription)\nShare UI:\n\(shareUI.debugDescription)"
            )
            activityList = remoteActivityList
            shareHost = shareUI
        }
        let close = shareHost.buttons["Close"].firstMatch
        XCTAssertTrue(close.waitForExistence(timeout: 5))
        close.tap()
        XCTAssertTrue(activityList.waitForNonExistence(timeout: 5))
    }

    private func element(_ identifier: String, in app: XCUIApplication) -> XCUIElement {
        let button = app.buttons[identifier]
        if button.exists { return button }

        let textField = app.textFields[identifier]
        if textField.exists { return textField }

        return app.descendants(matching: .any)[identifier]
    }
}
