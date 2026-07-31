import SwiftUI

struct PeopleListItem: Identifiable {
    let person: Person
    let role: String
    let relationshipDetail: String?
    var id: String { person.id }
}

struct PeopleSheet: View {
    let people: [PeopleListItem]
    let onSelect: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var searchText = ""

    private var filteredPeople: [PeopleListItem] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return people }
        return people.filter {
            $0.person.displayName.localizedCaseInsensitiveContains(query) ||
                $0.role.localizedCaseInsensitiveContains(query)
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 8) {
                    ForEach(filteredPeople) { item in
                        Button {
                            onSelect(item.person.id)
                            dismiss()
                        } label: {
                            HStack {
                                ProfilePhotoAvatar(
                                    data: item.person.profilePhotoData,
                                    initials: item.person.displayName.prefix(1).uppercased(),
                                    size: 44
                                )
                                .overlay(Circle().stroke(HeritgColor.line))

                                VStack(alignment: .leading, spacing: 2) {
                                    Text(item.person.displayName)
                                        .font(.body.bold())
                                        .foregroundStyle(HeritgColor.text)
                                    if let relationshipDetail = item.relationshipDetail {
                                        Text(relationshipDetail)
                                            .font(.caption)
                                            .foregroundStyle(HeritgColor.subtleText)
                                    }
                                    if let lifeSummary = item.person.lifeSummary {
                                        Text(lifeSummary)
                                            .font(.caption)
                                            .foregroundStyle(HeritgColor.subtleText)
                                    }
                                }
                                Spacer()
                                Image(systemName: "arrow.right")
                                    .foregroundStyle(HeritgColor.subtleText)
                            }
                            .padding(14)
                            .background(HeritgColor.base)
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 12).stroke(HeritgColor.line))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(item.person.displayName)
                        .accessibilityValue([item.relationshipDetail, item.person.lifeSummary].compactMap { $0 }.joined(separator: ", "))
                        .accessibilityHint("Centers this person on the family tree")
                        .accessibilityIdentifier("people.row.\(item.person.id)")
                    }
                }
                .padding(20)
            }
            .background(HeritgColor.canvas)
            .navigationTitle("All people")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(
                text: $searchText,
                placement: .navigationBarDrawer(displayMode: .always),
                prompt: Text("Search people", comment: "People search prompt")
            )
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .accessibilityIdentifier("people.close")
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }
}
