//
//  ContentView.swift
//  Heritg
//
//  Created by Hamanto Studio on 28/07/26.
//

import CoreData
import SwiftUI

struct ContentView: View {
    @Environment(\.managedObjectContext) private var modelContext
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @FetchRequest(
        sortDescriptors: [NSSortDescriptor(keyPath: \FamilyTree.updatedAt, ascending: false)]
    ) private var fetchedTrees: FetchedResults<FamilyTree>
    @FetchRequest(
        sortDescriptors: [NSSortDescriptor(keyPath: \Person.createdAt, ascending: true)]
    ) private var fetchedPeople: FetchedResults<Person>
    @FetchRequest(
        sortDescriptors: [NSSortDescriptor(keyPath: \FamilyRelationship.createdAt, ascending: true)]
    ) private var fetchedRelationships: FetchedResults<FamilyRelationship>
    @AppStorage("selectedFamilyTreeID") private var selectedTreeID = ""

    @State private var focusedPersonID: String?
    @State private var presentedPerson: Person?
    @State private var relationshipActionTarget: Person?
    @State private var addTargetPerson: Person?
    @State private var linkTargetPerson: Person?
    @State private var isCreatingFirstPerson = false
    @State private var isShowingPeople = false
    @State private var isShowingSettings = false
    @State private var isShowingTrees = false
    @State private var pendingExportTreeID: String?
    @State private var importNotice: String?
    @State private var importError: String?
    @State private var isImportingGEDCOM = false
    @State private var generationLimits = TreeGenerationLimits.unlimited
    @State private var splitViewVisibility = NavigationSplitViewVisibility.detailOnly
    @State private var preparedTreeLayout: PreparedTreeLayout?

    var body: some View {
        rootContent
        .overlay(alignment: .top) {
            if isImportingGEDCOM {
                HStack(spacing: 10) {
                    ProgressView()
                    Text("Importing GEDCOM…")
                        .font(.callout.weight(.semibold))
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(.regularMaterial, in: Capsule())
                .shadow(color: .black.opacity(0.12), radius: 12, y: 4)
                .padding(.top, 12)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("trees.importProgress")
                .allowsHitTesting(false)
            }
        }
        .sheet(isPresented: $isCreatingFirstPerson) {
            NewPersonSheet(
                title: String(localized: "Start your family tree", locale: AppLanguage.selectedLocale),
                actionTitle: String(localized: "Add person", locale: AppLanguage.selectedLocale),
                accessibilityPrefix: "firstPerson"
            ) { name in
                guard let activeTree else { return }
                let person = try FamilyGraph.createPerson(
                    named: name,
                    in: activeTree,
                    context: modelContext
                )
                focusedPersonID = person.id
                rememberFocus(person.id)
            }
        }
        .sheet(isPresented: $isShowingPeople) {
            PeopleSheet(people: peopleListItems) { personID in
                focus(on: personID)
            }
        }
        .sheet(isPresented: $isShowingSettings) {
            if let activeTree {
                SettingsSheet(
                    tree: activeTree,
                    people: people,
                    relationships: relationships,
                    selectedPersonID: resolvedFocusID,
                    generationLimits: appliedGenerationLimits
                )
            }
        }
        .fullScreenCover(isPresented: $isShowingTrees, onDismiss: presentPendingExport) {
            treeLibrary(allowsDismiss: true)
        }
        .alert("Import Completed", isPresented: importNoticeBinding) {
            Button("OK", role: .cancel) { importNotice = nil }
        } message: {
            Text(importNotice ?? "")
        }
        .alert("Couldn’t Import GEDCOM", isPresented: importErrorBinding) {
            Button("OK", role: .cancel) { importError = nil }
        } message: {
            Text(importError ?? "")
        }
        .sheet(item: $addTargetPerson) { target in
            AddRelativeSheet(
                targetName: target.displayName,
                coParents: FamilyGraph.activePartners(
                    of: target,
                    people: people,
                    relationships: relationships
                )
            ) { name, role, details, marriageDate, coParent in
                _ = try FamilyGraph.addRelative(
                    named: name,
                    to: target,
                    as: role,
                    details: details,
                    marriageDate: marriageDate,
                    coParent: coParent,
                    relationships: relationships,
                    in: modelContext
                )
                focus(on: target.id)
            }
        }
        .sheet(item: $linkTargetPerson) { target in
            LinkRelationshipSheet(
                targetName: target.displayName,
                people: people.filter { $0.id != target.id }
            ) { relative, role in
                try FamilyGraph.link(
                    target,
                    to: relative,
                    as: role,
                    relationships: relationships,
                    in: modelContext
                )
                focus(on: target.id)
            }
        }
        .confirmationDialog(
            "Add to \(relationshipActionTarget?.displayName ?? "")",
            isPresented: relationshipActionIsPresented,
            titleVisibility: .visible,
            presenting: relationshipActionTarget
        ) { target in
            Button("Add person") {
                addTargetPerson = target
            }
            .accessibilityIdentifier("relationship.action.add")
            Button("Link an existing family member") {
                linkTargetPerson = target
            }
            .disabled(people.count < 2)
            .accessibilityIdentifier("relationship.action.link")
            Button("Cancel", role: .cancel) {}
        }
        .sheet(item: $presentedPerson, onDismiss: { presentedPerson = nil }) { person in
            PersonSheet(
                person: person,
                relatedPeople: relatedPeople(for: person),
                availablePeople: people.filter { $0.id != person.id },
                onSave: { name, gender, details, relationshipsToDelete, peopleToLink in
                    try FamilyGraph.update(
                        person,
                        name: name,
                        gender: gender,
                        details: details,
                        deleting: relationshipsToDelete,
                        linking: peopleToLink,
                        relationships: relationships,
                        in: modelContext
                    )
                },
                onDeletePerson: {
                    try FamilyGraph.deletePerson(
                        person,
                        relationships: relationships,
                        in: modelContext
                    )
                    focus(on: people.first(where: { $0.id != person.id })?.id)
                    presentedPerson = nil
                }
            )
        }
        .onAppear { restoreFocus() }
        .onChange(of: activeTreeID) { _ in restoreFocus() }
        .onChange(of: people.map(\.id)) { _ in ensureValidFocus() }
        .onChange(of: availableGenerationLevels) { availableLevels in
            guard resolvedFocusID != nil else { return }
            generationLimits = generationLimits.clamped(to: availableLevels)
        }
        .task(id: activeTree?.id) {
            bootstrapStore()
#if DEBUG
            seedDebugFamilyIfNeeded()
#endif
        }
    }

    @ViewBuilder
    private var rootContent: some View {
        if horizontalSizeClass == .regular {
            NavigationSplitView(columnVisibility: adaptiveSplitVisibility) {
                treeLibrary(allowsDismiss: false)
                    .navigationSplitViewColumnWidth(min: 280, ideal: 320, max: 420)
            } detail: {
                canvasContent
            }
        } else if activeTree != nil {
            canvasContent
        } else {
            treeLibrary(allowsDismiss: false)
        }
    }

    @ViewBuilder
    private var canvasContent: some View {
        if let activeTree {
            HeritgTreeCanvas(
                layout: displayedTreeLayout,
                connectionPlan: displayedTreeConnectionPlan,
                sourcePersonCount: people.count,
                focusedPersonID: resolvedFocusID,
                isPreparingLayout: isPreparingTreeLayout,
                generationLimits: $generationLimits,
                availableGenerationLevels: availableGenerationLevels,
                onSelectPerson: selectPerson,
                onDeselectPerson: { focus(on: nil) },
                onAddRelative: selectAddTarget,
                onCreateFirstPerson: { isCreatingFirstPerson = true },
                onShowTrees: showTreeLibrary,
                onShowPeople: { isShowingPeople = true },
                onShowSettings: { isShowingSettings = true },
                onEditPerson: editPerson
            )
            .id(activeTree.id)
            .task(id: treeLayoutRequest) {
                await prepareTreeLayout(treeLayoutRequest)
            }
        } else {
            VStack(spacing: 12) {
                Image(systemName: "tree")
                    .font(.largeTitle)
                    .foregroundStyle(HeritgColor.subtleText)
                Text("Select a Family Tree")
                    .font(.title2.weight(.semibold))
                Text("Choose or create a family tree in the sidebar.")
                    .foregroundStyle(HeritgColor.subtleText)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(HeritgColor.treeCanvas)
        }
    }

    private var activeTree: FamilyTree? {
        guard let activeTreeID else { return nil }
        return trees.first { $0.id == activeTreeID }
    }

    private var trees: [FamilyTree] { Array(fetchedTrees) }
    private var allPeople: [Person] { Array(fetchedPeople) }
    private var allRelationships: [FamilyRelationship] { Array(fetchedRelationships) }

    private var adaptiveSplitVisibility: Binding<NavigationSplitViewVisibility> {
        Binding(
            get: { activeTree == nil ? .all : splitViewVisibility },
            set: { splitViewVisibility = $0 }
        )
    }

    private var resolvedFocusID: String? {
        if let focusedPersonID, people.contains(where: { $0.id == focusedPersonID }) {
            return focusedPersonID
        }
        return nil
    }

    private var people: [Person] {
        guard let activeTreeID else { return [] }
        return allPeople.filter { $0.treeID == activeTreeID }
    }

    private var relationships: [FamilyRelationship] {
        guard let activeTreeID else { return [] }
        return allRelationships.filter { $0.treeID == activeTreeID }
    }

    private var activeTreeID: String? {
        guard !trees.isEmpty else { return nil }
        if !selectedTreeID.isEmpty, trees.contains(where: { $0.id == selectedTreeID }) {
            return selectedTreeID
        }
        return trees.first?.id
    }

    @ViewBuilder
    private func treeLibrary(allowsDismiss: Bool) -> some View {
        FamilyTreeLibraryView(
            trees: trees,
            people: allPeople,
            relationships: allRelationships,
            selectedTreeID: activeTreeID,
            allowsDismiss: allowsDismiss,
            isProcessingImport: $isImportingGEDCOM,
            onSelect: selectTree,
            onCreate: { name in
                try FamilyGraph.createTree(named: name, in: modelContext)
            },
            onRename: { tree, name in
                try FamilyGraph.renameTree(tree, to: name, in: modelContext)
            },
            onDelete: deleteTree,
            onExport: requestExport,
            onImport: importGEDCOM,
            onImportError: { importError = $0 },
            onImportArchive: { payload in
                try FamilyGraph.importArchive(payload, in: modelContext)
            }
        )
    }

    private func selectTree(_ tree: FamilyTree) {
        selectedTreeID = tree.id
        restoreFocus(for: tree)
        generationLimits = .unlimited
        presentedPerson = nil
        relationshipActionTarget = nil
        addTargetPerson = nil
        linkTargetPerson = nil
        isShowingPeople = false
        isShowingSettings = false
    }

    private func showTreeLibrary() {
        if horizontalSizeClass == .regular {
            splitViewVisibility = splitViewVisibility == .all ? .detailOnly : .all
        } else {
            isShowingTrees = true
        }
    }

    private func deleteTree(_ tree: FamilyTree) throws {
        try FamilyGraph.deleteTree(
            tree,
            in: modelContext
        )
        if selectedTreeID == tree.id {
            selectedTreeID = trees.first(where: { $0.id != tree.id })?.id ?? ""
        }
    }

    private func requestExport(_ tree: FamilyTree) {
        selectTree(tree)
        pendingExportTreeID = tree.id
        if horizontalSizeClass == .regular {
            splitViewVisibility = .detailOnly
            presentPendingExport()
        } else if isShowingTrees {
            isShowingTrees = false
        } else {
            presentPendingExport()
        }
    }

    private func presentPendingExport() {
        guard pendingExportTreeID == activeTreeID else { return }
        pendingExportTreeID = nil
        isShowingSettings = true
    }

    private func importGEDCOM(data: Data, sourceName: String) async throws {
        let shouldSelectImportedTree = activeTree == nil
        let importData = try await Task.detached(priority: .userInitiated) {
            try GEDCOMImporter.parse(data: data, sourceName: sourceName)
        }.value
        let tree = try await FamilyGraph.importGEDCOMInBackground(importData, in: modelContext)
        let peopleSummary = String(
            localized: "\(importData.people.count) people",
            locale: AppLanguage.selectedLocale
        )
        if importData.warnings.isEmpty {
            importNotice = String(
                localized: "Imported \(peopleSummary) into \(tree.title).",
                locale: AppLanguage.selectedLocale,
                comment: "Successful GEDCOM import with person count and family tree title."
            )
        } else {
            let preview = importData.warnings.prefix(3).joined(separator: "\n")
            let warningSummary = String(
                localized: "\(importData.warnings.count) warnings",
                locale: AppLanguage.selectedLocale
            )
            importNotice = String(
                localized: "Imported \(peopleSummary) with \(warningSummary).\n\n\(preview)",
                locale: AppLanguage.selectedLocale,
                comment: "GEDCOM import result followed by up to three warning messages."
            )
        }
        if shouldSelectImportedTree { selectTree(tree) }
    }

    private var importNoticeBinding: Binding<Bool> {
        Binding(
            get: { importNotice != nil },
            set: { if !$0 { importNotice = nil } }
        )
    }

    private var importErrorBinding: Binding<Bool> {
        Binding(
            get: { importError != nil },
            set: { if !$0 { importError = nil } }
        )
    }

    private func bootstrapStore() {
        do {
            if trees.isEmpty, !allPeople.isEmpty || !allRelationships.isEmpty {
                let legacyTree = try FamilyGraph.createTree(
                    named: String(localized: "My Family Tree", locale: AppLanguage.selectedLocale),
                    in: modelContext
                )
                for person in allPeople { person.treeID = legacyTree.id }
                for relationship in allRelationships { relationship.treeID = legacyTree.id }
                try modelContext.save()
                selectedTreeID = legacyTree.id
            } else if let firstTree = trees.first {
                var changed = false
                for person in allPeople where person.treeID.isEmpty {
                    person.treeID = firstTree.id
                    changed = true
                }
                for relationship in allRelationships where relationship.treeID.isEmpty {
                    relationship.treeID = firstTree.id
                    changed = true
                }
                if changed { try modelContext.save() }
                if selectedTreeID.isEmpty || !trees.contains(where: { $0.id == selectedTreeID }) {
                    selectedTreeID = firstTree.id
                }
            }
        } catch {
            modelContext.rollback()
        }
    }

    private var treeLayoutRequest: TreeLayoutRequest {
        TreeLayoutRequest(
            treeID: activeTreeID,
            selectedPersonID: resolvedFocusID,
            people: personSnapshots,
            relationships: relationshipSnapshots,
            generationLimits: generationLimits,
            localeIdentifier: AppLanguage.selectedLocale.identifier
        )
    }

    private var displayedTreeLayout: TreeLayoutResult {
        guard preparedTreeLayout?.request.treeID == activeTreeID else { return .empty }
        return preparedTreeLayout?.layout ?? .empty
    }

    private var displayedTreeConnectionPlan: TreeConnectionPlan {
        guard preparedTreeLayout?.request.treeID == activeTreeID else { return .empty }
        return preparedTreeLayout?.connectionPlan ?? .empty
    }

    private var isPreparingTreeLayout: Bool {
        preparedTreeLayout?.request != treeLayoutRequest
    }

    private var appliedGenerationLimits: TreeGenerationLimits {
        generationLimits.clamped(to: availableGenerationLevels)
    }

    private var availableGenerationLevels: TreeAvailableGenerationLevels {
        guard preparedTreeLayout?.request.treeID == activeTreeID else { return .none }
        return preparedTreeLayout?.availableGenerationLevels ?? .none
    }

    private var personSnapshots: [PersonSnapshot] {
        people.map(\.treeSnapshot)
    }

    private var relationshipSnapshots: [RelationshipSnapshot] {
        relationships.map(\.treeSnapshot)
    }

    private func prepareTreeLayout(_ request: TreeLayoutRequest) async {
        let previous = preparedTreeLayout
        let preparationTask = Task.detached(priority: .userInitiated) {
            () -> PreparedTreeLayout? in
            guard !Task.isCancelled else { return nil }
            let availableGenerationLevels = TreeLayout.availableGenerationLevels(
                selectedPersonID: request.selectedPersonID,
                people: request.people,
                relationships: request.relationships
            )
            guard !Task.isCancelled else { return nil }
            let appliedGenerationLimits = request.generationLimits.clamped(
                to: availableGenerationLevels
            )
            let layout: TreeLayoutResult
            let canReuseGeometry: Bool
            if let previous, request.canReuseGeometry(from: previous.request) {
                canReuseGeometry = true
                layout = TreeLayout.updatingRelationshipLabels(
                    in: previous.layout,
                    selectedPersonID: request.selectedPersonID,
                    people: request.people,
                    relationships: request.relationships
                )
            } else {
                canReuseGeometry = false
                layout = TreeLayout.make(
                    focusedPersonID: nil,
                    people: request.people,
                    relationships: request.relationships,
                    selectedPersonID: request.selectedPersonID,
                    generationLimits: appliedGenerationLimits
                )
            }
            guard !Task.isCancelled else { return nil }
            let connectionPlan: TreeConnectionPlan
            if canReuseGeometry,
               let previous,
               request.localeIdentifier == previous.request.localeIdentifier {
                connectionPlan = previous.connectionPlan
            } else {
                connectionPlan = TreeConnectionPlan.make(
                    from: layout,
                    showsRelationshipLabels: true,
                    controlsVisible: true,
                    sourcePersonCount: request.people.count
                )
            }
            guard !Task.isCancelled else { return nil }
            return PreparedTreeLayout(
                request: request,
                layout: layout,
                connectionPlan: connectionPlan,
                availableGenerationLevels: availableGenerationLevels
            )
        }
        let prepared = await withTaskCancellationHandler {
            await preparationTask.value
        } onCancel: {
            preparationTask.cancel()
        }
        guard !Task.isCancelled,
              request == treeLayoutRequest,
              let prepared else { return }
        preparedTreeLayout = prepared
    }

    private func selectPerson(_ personID: String, role _: String) {
        focus(on: resolvedFocusID == personID ? nil : personID)
    }

    private func editPerson(_ personID: String, role _: String) {
        guard let person = people.first(where: { $0.id == personID }) else { return }
        presentedPerson = person
    }

    private func selectAddTarget(_ personID: String) {
        guard let person = people.first(where: { $0.id == personID }) else { return }
        focus(on: personID)
        relationshipActionTarget = person
    }

    private var relationshipActionIsPresented: Binding<Bool> {
        Binding(
            get: { relationshipActionTarget != nil },
            set: { if !$0 { relationshipActionTarget = nil } }
        )
    }

    private func ensureValidFocus() {
        if let focusedPersonID, people.contains(where: { $0.id == focusedPersonID }) {
            rememberFocus(focusedPersonID)
            return
        }
        restoreFocus()
    }

    private func focus(on personID: String?) {
        guard let personID else {
            focusedPersonID = nil
            rememberFocus(nil)
            return
        }
        guard people.contains(where: { $0.id == personID }) else { return }
        focusedPersonID = personID
        rememberFocus(personID)
    }

    private func restoreFocus(for tree: FamilyTree? = nil) {
        guard let tree = tree ?? activeTree else {
            focusedPersonID = nil
            return
        }
        let restoredID = tree.resolvedFocusID(in: allPeople)
        focusedPersonID = restoredID
        rememberFocus(restoredID, in: tree)
    }

    private func rememberFocus(_ personID: String?, in tree: FamilyTree? = nil) {
        guard let tree = tree ?? activeTree else { return }
        guard tree.lastSelectedPersonID != personID else { return }
        tree.lastSelectedPersonID = personID
        do {
            try modelContext.save()
        } catch {
            modelContext.rollback()
        }
    }

    #if DEBUG
    private func seedDebugFamilyIfNeeded() {
        guard let treeID = activeTreeID else { return }
        let isLegacyDebugSeed = UserDefaults.standard.bool(forKey: "debugFamilySeeded")
        let isPreviousDebugFixture = UserDefaults.standard.bool(forKey: "debugRelationshipFixtureSeeded")
        let isPreviousSukarnoFixture = UserDefaults.standard.bool(forKey: "debugSukarnoFixtureSeeded")
        let isPreviousSukarnoDatesFixture = UserDefaults.standard.bool(forKey: "debugSukarnoDatesFixtureSeeded")
        guard (people.isEmpty || isLegacyDebugSeed || isPreviousDebugFixture
                || isPreviousSukarnoFixture || isPreviousSukarnoDatesFixture),
              !ProcessInfo.processInfo.arguments.contains("-ui_testing"),
              !UserDefaults.standard.bool(forKey: "debugSukarnoPuanFamilyFixtureSeeded") else {
            return
        }

        if isLegacyDebugSeed || isPreviousDebugFixture || isPreviousSukarnoFixture
            || isPreviousSukarnoDatesFixture {
            for relationship in relationships {
                modelContext.delete(relationship)
            }
            for person in people {
                modelContext.delete(person)
            }
        }

        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        func date(_ year: Int, _ month: Int, _ day: Int) -> Date {
            calendar.date(from: DateComponents(year: year, month: month, day: day))!
        }

        let peopleToSeed: [(
            id: String,
            name: String,
            gender: PersonGender,
            birthDate: Date?,
            deathDate: Date?
        )] = [
            ("soekemi", "Raden Soekemi Sosrodihardjo", .male, date(1873, 6, 15), date(1945, 5, 18)),
            ("ida-ayu", "Ida Ayu Nyoman Rai", .female, date(1881, 1, 1), date(1958, 9, 12)),
            ("sukarno", "Sukarno", .male, date(1901, 6, 6), date(1970, 6, 21)),
            ("fatmawati", "Fatmawati", .female, date(1923, 2, 5), date(1980, 5, 14)),
            ("guntur", "Guntur Soekarnoputra", .male, date(1944, 11, 3), nil),
            ("megawati", "Megawati Soekarnoputri", .female, date(1947, 1, 23), nil),
            ("rachmawati", "Rachmawati Soekarnoputri", .female, date(1950, 9, 27), date(2021, 7, 3)),
            ("sukmawati", "Sukmawati Soekarnoputri", .female, date(1951, 10, 26), nil),
            ("guruh", "Guruh Soekarnoputra", .male, date(1953, 1, 13), nil),
            ("taufiq", "Taufiq Kiemas", .male, date(1942, 12, 31), date(2013, 6, 8)),
            ("puan", "Puan Maharani", .female, date(1973, 9, 6), nil),
            ("hapsoro", "Hapsoro Sukmonohadi", .male, nil, nil),
            ("pinka", "Diah Pikatan Orissa Putri Hapsari", .female, nil, nil),
            ("praba", "Praba Diwangkata Craka Putra Soma", .male, nil, nil),
        ]
        let seededPeople = peopleToSeed.enumerated().reduce(into: [String: Person]()) { result, item in
            let (index, person) = item
            let seededPerson = Person(
                id: person.id,
                treeID: treeID,
                displayName: person.name,
                gender: person.gender,
                createdAt: Date(timeIntervalSince1970: TimeInterval(index))
            )
            seededPerson.birthDate = person.birthDate
            seededPerson.deathDate = person.deathDate
            result[person.id] = seededPerson
        }

        for person in seededPeople.values {
            modelContext.insert(person)
        }
        let parentRelationships = [
            ("soekemi", "sukarno"), ("ida-ayu", "sukarno"),
            ("sukarno", "guntur"), ("fatmawati", "guntur"),
            ("sukarno", "megawati"), ("fatmawati", "megawati"),
            ("sukarno", "rachmawati"), ("fatmawati", "rachmawati"),
            ("sukarno", "sukmawati"), ("fatmawati", "sukmawati"),
            ("sukarno", "guruh"), ("fatmawati", "guruh"),
            ("megawati", "puan"), ("taufiq", "puan"),
            ("puan", "pinka"), ("hapsoro", "pinka"),
            ("puan", "praba"), ("hapsoro", "praba"),
        ]
        for (index, relationship) in parentRelationships.enumerated() {
            modelContext.insert(FamilyRelationship(
                id: "parent-\(relationship.0)-\(relationship.1)",
                treeID: treeID,
                fromPersonID: seededPeople[relationship.0]!.id,
                toPersonID: seededPeople[relationship.1]!.id,
                kind: .parent,
                createdAt: Date(timeIntervalSince1970: TimeInterval(index))
            ))
        }
        let partnerRelationships: [(String, String, Date?)] = [
            ("sukarno", "fatmawati", date(1943, 6, 1)),
            ("megawati", "taufiq", date(1973, 3, 27)),
            ("puan", "hapsoro", nil),
        ]
        for relationship in partnerRelationships {
            modelContext.insert(FamilyRelationship(
                id: "partner-\(relationship.0)-\(relationship.1)",
                treeID: treeID,
                fromPersonID: seededPeople[relationship.0]!.id,
                toPersonID: seededPeople[relationship.1]!.id,
                kind: .partner,
                subtype: .spouse,
                marriageDate: relationship.2
            ))
        }

        do {
            try modelContext.save()
            UserDefaults.standard.removeObject(forKey: "debugFamilySeeded")
            UserDefaults.standard.removeObject(forKey: "debugRelationshipFixtureSeeded")
            UserDefaults.standard.removeObject(forKey: "debugSukarnoFixtureSeeded")
            UserDefaults.standard.removeObject(forKey: "debugSukarnoDatesFixtureSeeded")
            UserDefaults.standard.set(true, forKey: "debugSukarnoPuanFamilyFixtureSeeded")
        } catch {
            modelContext.rollback()
        }
    }
#endif

    private func relatedPeople(
        for person: Person
    ) -> [(relationship: FamilyRelationship, person: Person, role: String)] {
        let peopleByID = people.reduce(into: [String: Person]()) { result, person in
            result[person.id] = person
        }
        return relationships.compactMap { relationship in
            switch relationship.kind {
            case .parent where relationship.toPersonID == person.id:
                guard let relative = peopleByID[relationship.fromPersonID] else { return nil }
                return (relationship, relative, roleLabel(for: relative, relationship: relationship, focusID: person.id))
            case .parent where relationship.fromPersonID == person.id:
                guard let relative = peopleByID[relationship.toPersonID] else { return nil }
                return (relationship, relative, roleLabel(for: relative, relationship: relationship, focusID: person.id))
            case .partner where relationship.fromPersonID == person.id:
                guard let relative = peopleByID[relationship.toPersonID] else { return nil }
                return (relationship, relative, roleLabel(for: relative, relationship: relationship, focusID: person.id))
            case .partner where relationship.toPersonID == person.id:
                guard let relative = peopleByID[relationship.fromPersonID] else { return nil }
                return (relationship, relative, roleLabel(for: relative, relationship: relationship, focusID: person.id))
            case .sibling where relationship.fromPersonID == person.id:
                guard let relative = peopleByID[relationship.toPersonID] else { return nil }
                return (relationship, relative, roleLabel(for: relative, relationship: relationship, focusID: person.id))
            case .sibling where relationship.toPersonID == person.id:
                guard let relative = peopleByID[relationship.fromPersonID] else { return nil }
                return (relationship, relative, roleLabel(for: relative, relationship: relationship, focusID: person.id))
            default:
                return nil
            }
        }
    }

    private var peopleListItems: [PeopleListItem] {
        people.map { person in
            let relationship = relationshipToFocus(for: person)
            return PeopleListItem(
                person: person,
                role: roleRelativeToFocus(person),
                relationshipDetail: relationship.map { relationshipSummary(roleRelativeToFocus(person), relationship: $0) }
            )
        }
    }

    private func relationshipToFocus(for person: Person) -> FamilyRelationship? {
        guard let focusID = resolvedFocusID, person.id != focusID else { return nil }
        return relationships.first {
            ($0.fromPersonID == person.id && $0.toPersonID == focusID) ||
                ($0.toPersonID == person.id && $0.fromPersonID == focusID)
        }
    }

    private func relationshipSummary(_ role: String, relationship: FamilyRelationship) -> String {
        guard let marriageYear = relationship.marriageYear else { return role }
        return AppLanguage.localized("\(role) · Married \(marriageYear)")
    }

    private func roleRelativeToFocus(_ person: Person) -> String {
        guard let focusID = resolvedFocusID else {
            return AppLanguage.localized("Family member")
        }
        if person.id == focusID {
            return AppLanguage.localized("Focused person")
        }
        return KinshipResolver.label(
            for: person.id,
            relativeTo: focusID,
            people: people.map(\.treeSnapshot),
            relationships: relationships.map(\.treeSnapshot)
        ) ?? AppLanguage.localized("Family member")
    }

    private func roleLabel(
        for relative: Person,
        relationship: FamilyRelationship,
        focusID: String
    ) -> String {
        FamilyRoleLabel.label(
            relativeGender: relative.gender,
            relationshipKind: relationship.kind,
            focusedPersonID: focusID,
            fromPersonID: relationship.fromPersonID,
            toPersonID: relationship.toPersonID,
            relationshipSubtype: relationship.subtype
        )
    }
}

nonisolated private struct TreeLayoutRequest: Equatable, Sendable {
    let treeID: String?
    let selectedPersonID: String?
    let people: [PersonSnapshot]
    let relationships: [RelationshipSnapshot]
    let generationLimits: TreeGenerationLimits
    let localeIdentifier: String

    func canReuseGeometry(from previous: TreeLayoutRequest) -> Bool {
        guard treeID == previous.treeID,
              people == previous.people,
              relationships == previous.relationships,
              generationLimits == previous.generationLimits else {
            return false
        }
        return generationLimits.isUnlimited || selectedPersonID == previous.selectedPersonID
    }
}

nonisolated private struct PreparedTreeLayout: Sendable {
    let request: TreeLayoutRequest
    let layout: TreeLayoutResult
    let connectionPlan: TreeConnectionPlan
    let availableGenerationLevels: TreeAvailableGenerationLevels
}

#Preview {
    let persistenceController = PersistenceController(inMemory: true)
    ContentView()
        .environment(\.managedObjectContext, persistenceController.container.viewContext)
}
