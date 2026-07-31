import SwiftUI

struct PendingArchiveImport: Identifiable {
    let id = UUID()
    let data: Data
    let sourceName: String
}

struct ArchiveImportPasswordView: View {
    let pendingImport: PendingArchiveImport
    let onRestore: (HeritgArchivePayload) throws -> Void

    @Environment(\.dismiss) private var dismiss
    @FocusState private var passwordIsFocused: Bool
    @AccessibilityFocusState private var errorIsFocused: Bool
    @State private var password = ""
    @State private var operationError: String?
    @State private var isRestoring = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(pendingImport.sourceName)
                        .font(.headline)
                    SecureField("Password", text: $password)
                        .textContentType(.password)
                        .focused($passwordIsFocused)
                        .accessibilityIdentifier("archiveImport.password")
                } header: {
                    Text("Encrypted Heritg backup")
                } footer: {
                    Text("Enter the password used when this backup was created.")
                }

                if let operationError {
                    Section {
                        Text(operationError)
                            .foregroundStyle(HeritgColor.danger)
                            .accessibilityFocused($errorIsFocused)
                    }
                }

                Section {
                    Button {
                        restore()
                    } label: {
                        Label(
                            isRestoring ? "Decrypting backup" : "Restore family tree",
                            systemImage: isRestoring ? "hourglass" : "lock.open"
                        )
                        .frame(maxWidth: .infinity)
                    }
                    .disabled(password.isEmpty || isRestoring)
                    .accessibilityIdentifier("archiveImport.restore")
                }
            }
            .navigationTitle("Restore Backup")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .onAppear { passwordIsFocused = true }
        }
    }

    private func restore() {
        let enteredPassword = password
        operationError = nil
        isRestoring = true
        Task {
            defer { isRestoring = false }
            do {
                let payload = try await Task.detached(priority: .userInitiated) {
                    try HeritgArchive.decrypt(pendingImport.data, password: enteredPassword)
                }.value
                try onRestore(payload)
                password = ""
                dismiss()
            } catch {
                operationError = error.localizedDescription
                errorIsFocused = true
            }
        }
    }
}
