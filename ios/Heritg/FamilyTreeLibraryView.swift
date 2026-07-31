import SwiftUI
import UniformTypeIdentifiers

struct FamilyTreeLibraryView: View {
    let trees: [FamilyTree]
    let people: [Person]
    let relationships: [FamilyRelationship]
    let selectedTreeID: String?
    let allowsDismiss: Bool
    let onSelect: (FamilyTree) -> Void
    let onCreate: (String) throws -> FamilyTree
    let onRename: (FamilyTree, String) throws -> Void
    let onDelete: (FamilyTree) throws -> Void
    let onExport: (FamilyTree) -> Void
    let onImport: (Data, String) throws -> FamilyTree
    let onImportArchive: (HeritgArchivePayload) throws -> FamilyTree

    @Environment(\.dismiss) private var dismiss
    @State private var searchText = ""
    @State private var isCreatingTree = false
    @State private var isImportingTree = false
    @State private var isImportingArchive = false
    @State private var pendingArchiveImport: PendingArchiveImport?
    @State private var newTreeName = String(
        localized: "My Family Tree",
        locale: AppLanguage.selectedLocale
    )
    @State private var renamingTree: FamilyTree?
    @State private var renameText = ""
    @State private var deletingTree: FamilyTree?
    @State private var operationError: String?

    private var filteredTrees: [FamilyTree] {
        let sorted = trees.sorted { $0.updatedAt > $1.updatedAt }
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return sorted }
        return sorted.filter { $0.title.localizedCaseInsensitiveContains(query) }
    }

    var body: some View {
        NavigationStack {
            Group {
                if trees.isEmpty {
                    emptyState
                } else {
                    treeList
                }
            }
            .background(HeritgColor.canvas)
            .navigationTitle("Family Trees")
            .toolbar {
                if allowsDismiss {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Done") { dismiss() }
                    }
                }
                ToolbarItem(placement: .primaryAction) {
                    Menu("Add family tree", systemImage: "plus") {
                        Button("New Family Tree", systemImage: "plus") {
                            newTreeName = suggestedTitle
                            isCreatingTree = true
                        }
                        Button("Import GEDCOM", systemImage: "square.and.arrow.down") {
                            isImportingTree = true
                        }
                        Button("Restore Heritg Backup", systemImage: "lock.open") {
                            isImportingArchive = true
                        }
                    }
                    .accessibilityIdentifier("trees.add")
                }
            }
            .searchable(text: $searchText, prompt: "Search family trees")
        }
        .alert("New Family Tree", isPresented: $isCreatingTree) {
            TextField("Family tree name", text: $newTreeName)
            Button("Cancel", role: .cancel) { }
            Button("Create") { createTree() }
                .accessibilityIdentifier("trees.create.confirm")
        } message: {
            Text("Give this family tree a name. You can rename it later.")
        }
        .alert("Rename Family Tree", isPresented: renamingBinding) {
            TextField("Family tree name", text: $renameText)
            Button("Cancel", role: .cancel) { renamingTree = nil }
            Button("Save") { renameTree() }
        }
        .alert(deleteTitle, isPresented: deletingBinding) {
            Button("Cancel", role: .cancel) { deletingTree = nil }
            Button("Delete Family Tree", role: .destructive) { deleteTree() }
        } message: {
            Text(deleteMessage)
        }
        .alert("Couldn’t Complete Action", isPresented: errorBinding) {
            Button("OK", role: .cancel) { operationError = nil }
        } message: {
            Text(operationError ?? "")
        }
        .fileImporter(
            isPresented: $isImportingTree,
            allowedContentTypes: gedcomTypes,
            allowsMultipleSelection: false,
            onCompletion: importGEDCOM
        )
        .fileImporter(
            isPresented: $isImportingArchive,
            allowedContentTypes: [.heritgArchive, .data],
            allowsMultipleSelection: false,
            onCompletion: loadArchive
        )
        .sheet(item: $pendingArchiveImport) { pendingImport in
            ArchiveImportPasswordView(pendingImport: pendingImport) { payload in
                let tree = try onImportArchive(payload)
                open(tree)
            }
        }
    }

    private var treeList: some View {
        List {
            ForEach(filteredTrees) { tree in
                HStack(spacing: 12) {
                    Button {
                        open(tree)
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: selectedTreeID == tree.id ? "tree.fill" : "tree")
                                .font(.title3)
                                .foregroundStyle(HeritgColor.brand)
                                .frame(width: 36, height: 36)
                                .background(HeritgColor.recessed)
                                .clipShape(Circle())

                            VStack(alignment: .leading, spacing: 3) {
                                Text(tree.title)
                                    .font(.body.bold())
                                    .foregroundStyle(HeritgColor.text)
                                Text(treeSummary(tree))
                                    .font(.caption)
                                    .foregroundStyle(HeritgColor.subtleText)
                            }
                            Spacer()
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Opens this family tree")
                    .accessibilityIdentifier("trees.open.\(tree.id)")

                    Menu("Actions for \(tree.title)", systemImage: "ellipsis") {
                        Button("Rename", systemImage: "pencil") {
                            renameText = tree.title
                            renamingTree = tree
                        }
                        Button("Export", systemImage: "square.and.arrow.up") {
                            onExport(tree)
                        }
                        Divider()
                        Button("Delete", systemImage: "trash", role: .destructive) {
                            deletingTree = tree
                        }
                    }
                    .labelStyle(.iconOnly)
                    .accessibilityIdentifier("trees.actions.\(tree.id)")
                }
                .padding(.vertical, 6)
                .listRowBackground(HeritgColor.base)
            }
        }
        .scrollContentBackground(.hidden)
    }

    private var emptyState: some View {
        VStack(spacing: 18) {
            Image(systemName: "tree")
                .font(.system(size: 48))
                .foregroundStyle(HeritgColor.brand)
            Text("Start your family archive")
                .font(.title2.bold())
                .foregroundStyle(HeritgColor.text)
            Text("Create a family tree from scratch or import an existing GEDCOM file. Your data stays on this device unless you export it.")
                .multilineTextAlignment(.center)
                .foregroundStyle(HeritgColor.subtleText)
                .frame(maxWidth: 360)
            Button("Create Family Tree", systemImage: "plus") {
                newTreeName = suggestedTitle
                isCreatingTree = true
            }
            .buttonStyle(HeritgButtonStyle(variant: .primary))
            .accessibilityIdentifier("trees.create")
            Button("Import GEDCOM", systemImage: "square.and.arrow.down") {
                isImportingTree = true
            }
            .buttonStyle(HeritgButtonStyle(variant: .secondary))
            .accessibilityIdentifier("trees.import")
            Button("Restore Heritg Backup", systemImage: "lock.open") {
                isImportingArchive = true
            }
            .buttonStyle(HeritgButtonStyle(variant: .secondary))
            .accessibilityIdentifier("trees.importHeritg")
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var suggestedTitle: String {
        let base = String(localized: "My Family Tree", locale: AppLanguage.selectedLocale)
        guard trees.contains(where: { $0.title == base }) else { return base }
        var number = 2
        while trees.contains(where: { $0.title == numberedTitle(base: base, number: number) }) {
            number += 1
        }
        return numberedTitle(base: base, number: number)
    }

    private var renamingBinding: Binding<Bool> {
        Binding(
            get: { renamingTree != nil },
            set: { if !$0 { renamingTree = nil } }
        )
    }

    private var deletingBinding: Binding<Bool> {
        Binding(
            get: { deletingTree != nil },
            set: { if !$0 { deletingTree = nil } }
        )
    }

    private var errorBinding: Binding<Bool> {
        Binding(
            get: { operationError != nil },
            set: { if !$0 { operationError = nil } }
        )
    }

    private var deleteTitle: String {
        guard let deletingTree else {
            return String(localized: "Delete Family Tree?", locale: AppLanguage.selectedLocale)
        }
        return String(localized: "Delete “\(deletingTree.title)”?")
    }

    private var deleteMessage: String {
        guard let deletingTree else {
            return String(localized: "This can’t be undone.", locale: AppLanguage.selectedLocale)
        }
        let personCount = people.count { $0.treeID == deletingTree.id }
        let relationshipCount = relationships.count { $0.treeID == deletingTree.id }
        return String(
            localized: "This permanently deletes \(personCount) people and \(relationshipCount) relationships from this device. This can’t be undone.",
            locale: AppLanguage.selectedLocale,
            comment: "Permanent family tree deletion warning with person and relationship counts."
        )
    }

    private var gedcomTypes: [UTType] {
        var types = [UTType.plainText]
        for fileExtension in ["ged", "gedcom"] {
            if let type = UTType(filenameExtension: fileExtension), !types.contains(type) {
                types.append(type)
            }
        }
        return types
    }

    private func treeSummary(_ tree: FamilyTree) -> String {
        let count = people.count { $0.treeID == tree.id }
        return String(
            localized: "\(count) people",
            locale: AppLanguage.selectedLocale,
            comment: "Number of people in a family tree."
        )
    }

    private func numberedTitle(base: String, number: Int) -> String {
        String(
            localized: "\(base) \(number)",
            locale: AppLanguage.selectedLocale,
            comment: "A duplicate family tree title followed by a number."
        )
    }

    private func open(_ tree: FamilyTree) {
        onSelect(tree)
        if allowsDismiss { dismiss() }
    }

    private func createTree() {
        do {
            let tree = try onCreate(newTreeName)
            open(tree)
        } catch {
            operationError = error.localizedDescription
        }
    }

    private func renameTree() {
        guard let tree = renamingTree else { return }
        defer { renamingTree = nil }
        do {
            try onRename(tree, renameText)
        } catch {
            operationError = error.localizedDescription
        }
    }

    private func deleteTree() {
        guard let tree = deletingTree else { return }
        defer { deletingTree = nil }
        do {
            try onDelete(tree)
        } catch {
            operationError = error.localizedDescription
        }
    }

    private func importGEDCOM(_ result: Result<[URL], Error>) {
        do {
            guard let url = try result.get().first else { return }
            let isAccessing = url.startAccessingSecurityScopedResource()
            defer { if isAccessing { url.stopAccessingSecurityScopedResource() } }
            let fileSize = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
            guard fileSize <= GEDCOMImporter.maximumBytes else {
                throw GEDCOMImportError.fileTooLarge
            }
            let data = try Data(contentsOf: url, options: .mappedIfSafe)
            let tree = try onImport(data, url.lastPathComponent)
            open(tree)
        } catch {
            operationError = error.localizedDescription
        }
    }

    private func loadArchive(_ result: Result<[URL], Error>) {
        do {
            guard let url = try result.get().first else { return }
            guard url.pathExtension.lowercased() == "heritg" else {
                throw HeritgArchiveError.invalidArchive
            }
            let isAccessing = url.startAccessingSecurityScopedResource()
            defer { if isAccessing { url.stopAccessingSecurityScopedResource() } }
            let fileSize = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
            guard fileSize <= HeritgArchive.maximumFileBytes else {
                throw HeritgArchiveError.fileTooLarge
            }
            let data = try Data(contentsOf: url, options: .mappedIfSafe)
            switch try HeritgArchive.protection(of: data) {
            case .encrypted:
                pendingArchiveImport = PendingArchiveImport(
                    data: data,
                    sourceName: url.lastPathComponent
                )
            case .unencrypted:
                let tree = try onImportArchive(HeritgArchive.decodeUnencrypted(data))
                open(tree)
            }
        } catch {
            operationError = error.localizedDescription
        }
    }
}
