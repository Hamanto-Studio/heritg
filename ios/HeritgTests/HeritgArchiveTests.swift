import CryptoKit
import Foundation
import SwiftData
import Testing
@testable import HERITG

struct HeritgArchiveTests {
    @Test func optionalPasswordPolicyMatchesEveryWriter() {
        #expect(ArchivePasswordPolicy.accepts(""))
        #expect(ArchivePasswordPolicy.accepts("Pass1234"))
        #expect(ArchivePasswordPolicy.accepts("Ångström1"))
        #expect(!ArchivePasswordPolicy.accepts("Pass1"))
        #expect(!ArchivePasswordPolicy.accepts("password1"))
        #expect(!ArchivePasswordPolicy.accepts("PASSWORD1"))
        #expect(!ArchivePasswordPolicy.accepts("Password"))
    }

    @Test func unencryptedZIPRoundTripPreservesPortableSemantics() throws {
        let payload = validPayload()
        let archive = try HeritgArchiveFormat.encode(payload)

        #expect(try HeritgArchive.protection(of: archive) == .unencrypted)
        #expect(archive.starts(with: [0x50, 0x4b, 0x03, 0x04]))
        let files = try HeritgZIP.decode(archive)
        #expect(Set(files.keys).contains("manifest.json"))
        #expect(Set(files.keys).contains("tree.json"))
        #expect(Set(files.keys).contains("people.jsonl"))
        #expect(Set(files.keys).contains("relationships.jsonl"))
        #expect(Set(files.keys).contains("checksums.sha256"))
        #expect(files.keys.contains { $0.hasPrefix("media/") && $0.hasSuffix(".png") })
        #expect(String(data: try #require(files["manifest.json"]), encoding: .utf8)?.contains(
            #""format":"heritg-family-archive""#
        ) == true)

        let decoded = try HeritgArchive.decodeUnencrypted(archive)
        #expect(decoded.schemaVersion == 1)
        #expect(decoded.exportedAt == payload.exportedAt)
        #expect(decoded.tree.id == payload.tree.id)
        #expect(decoded.tree.title == "Synthetic Family")
        #expect(decoded.people.map(\.id) == ["person-alpha", "person-beta"])
        #expect(decoded.people[0].displayName == "Ayu \u{00c9}lodie")
        #expect(calendarKey(decoded.people[0].birthDate) == "1985-04-12")
        #expect(decoded.people[0].profilePhotoData == payload.people[0].profilePhotoData)
        #expect(decoded.relationships[0].id == "relationship-alpha-beta")
        #expect(calendarKey(decoded.relationships[0].marriageDate) == "2010-06-20")
    }

    @Test func emptyPasswordStillProducesEncryptedArchiveAndRestoresWithoutPrompt() throws {
        let payload = validPayload()
        let salt = Data(0..<16)
        let nonce = Data(16..<28)
        let archive = try HeritgArchive.makeArchive(payload, password: "", salt: salt, nonce: nonce)

        #expect(try HeritgArchive.protection(of: archive) == .encrypted)
        #expect(sha256(archive) == "bc8df41b6991455fdad8150c610e56f32d0146ee117bbb7cb2636d3732595440")
        #expect(try HeritgArchive.decrypt(archive, password: "").tree.id == payload.tree.id)
    }

    @Test func deterministicEncryptionNormalizesUnicodePasswordsAndAuthenticatesBytes() throws {
        let payload = validPayload()
        let salt = Data(0..<16)
        let nonce = Data(16..<28)
        let decomposed = "Cafe\u{301} family"
        let precomposed = "Caf\u{00e9} family"

        let first = try HeritgArchive.makeArchive(
            payload,
            password: decomposed,
            salt: salt,
            nonce: nonce
        )
        let second = try HeritgArchive.makeArchive(
            payload,
            password: precomposed,
            salt: salt,
            nonce: nonce
        )

        #expect(first == second)
        #expect(try HeritgArchive.protection(of: first) == .encrypted)
        #expect(first.prefix(8) == Data("HTGENC01".utf8))
        #expect(first[8..<16] == Data([0, 1, 1, 1, 0, 9, 39, 192]))
        #expect(first[16..<32] == salt)
        #expect(first[32..<44] == nonce)
        #expect(sha256(first) == "2806b437258da23ca3e0f1f57df81ae69467869ed9d9e8e0c84e00cb9bcd2780")

        let decoded = try HeritgArchive.decrypt(first, password: precomposed)
        #expect(decoded.tree.id == payload.tree.id)
        #expect(decoded.people[0].notes == payload.people[0].notes)
        #expect(throws: HeritgArchiveError.wrongPasswordOrCorruptArchive) {
            try HeritgArchive.decrypt(first, password: "wrong password")
        }
        var tampered = first
        tampered[tampered.count - 20] ^= 0x01
        #expect(throws: HeritgArchiveError.wrongPasswordOrCorruptArchive) {
            try HeritgArchive.decrypt(tampered, password: precomposed)
        }
        var headerTampered = first
        headerTampered[16] ^= 0x01
        #expect(throws: HeritgArchiveError.wrongPasswordOrCorruptArchive) {
            try HeritgArchive.decrypt(headerTampered, password: precomposed)
        }
    }

    @Test func checksumAndUnexpectedEntryTamperingAreRejected() throws {
        let archive = try HeritgArchiveFormat.encode(validPayload())
        var files = try HeritgZIP.decode(archive)
        var people = try #require(files["people.jsonl"])
        people[people.startIndex + 10] ^= 0x01
        files["people.jsonl"] = people
        let checksumTampered = try HeritgZIP.encode(files.map { .init(path: $0.key, data: $0.value) })
        #expect(throws: HeritgArchiveError.invalidArchive) {
            try HeritgArchive.decodeUnencrypted(checksumTampered)
        }

        files = try HeritgZIP.decode(archive)
        files["unexpected.json"] = Data("{}".utf8)
        let extraEntry = try HeritgZIP.encode(files.map { .init(path: $0.key, data: $0.value) })
        #expect(throws: HeritgArchiveError.invalidArchive) {
            try HeritgArchive.decodeUnencrypted(extraEntry)
        }
    }

    @Test func malformedZIPPathsDuplicatesAndTrailingBytesAreRejected() throws {
        #expect(throws: HeritgArchiveError.invalidArchive) {
            try HeritgZIP.encode([.init(path: "../tree.json", data: Data())])
        }
        #expect(throws: HeritgArchiveError.invalidArchive) {
            try HeritgZIP.encode([
                .init(path: "tree.json", data: Data()),
                .init(path: "tree.json", data: Data()),
            ])
        }

        var archive = try HeritgArchiveFormat.encode(validPayload())
        archive.append(0)
        #expect(throws: HeritgArchiveError.invalidArchive) {
            try HeritgArchive.decodeUnencrypted(archive)
        }

        var linked = try HeritgArchiveFormat.encode(validPayload())
        let central = try #require(linked.range(of: Data([0x50, 0x4b, 0x01, 0x02])))
        linked[central.lowerBound + 5] = 3
        linked[central.lowerBound + 41] = 0xa0
        #expect(throws: HeritgArchiveError.invalidArchive) {
            try HeritgArchive.decodeUnencrypted(linked)
        }
    }

    @Test func fileAndFieldLimitsAreEnforced() throws {
        let oversized = Data(count: HeritgArchive.maximumFileBytes + 1)
        #expect(throws: HeritgArchiveError.fileTooLarge) {
            try HeritgArchive.protection(of: oversized)
        }

        let payload = validPayload(notes: String(repeating: "n", count: HeritgArchive.maximumNotesBytes + 1))
        #expect(throws: HeritgArchiveError.fieldTooLarge) {
            try HeritgArchive.makeArchive(payload, password: "")
        }
    }

    @MainActor
    @Test func importPreservesIDsAndRejectsCollisionsAtomically() throws {
        let context = try makeContext()
        let payload = validPayload()

        let imported = try FamilyGraph.importArchive(payload, in: context)
        let people = try context.fetch(FetchDescriptor<Person>())
        let relationships = try context.fetch(FetchDescriptor<FamilyRelationship>())
        #expect(imported.id == "tree-synthetic")
        #expect(imported.lastSelectedPersonID == "person-alpha")
        #expect(Set(people.map(\.id)) == ["person-alpha", "person-beta"])
        #expect(relationships.map(\.id) == ["relationship-alpha-beta"])

        let counts = (
            try context.fetchCount(FetchDescriptor<FamilyTree>()),
            try context.fetchCount(FetchDescriptor<Person>()),
            try context.fetchCount(FetchDescriptor<FamilyRelationship>())
        )
        #expect(throws: HeritgArchiveError.identifierCollision) {
            try FamilyGraph.importArchive(payload, in: context)
        }
        #expect(try context.fetchCount(FetchDescriptor<FamilyTree>()) == counts.0)
        #expect(try context.fetchCount(FetchDescriptor<Person>()) == counts.1)
        #expect(try context.fetchCount(FetchDescriptor<FamilyRelationship>()) == counts.2)
    }

    @MainActor
    @Test func invalidReferencesDoNotPartiallyImport() throws {
        let context = try makeContext()
        _ = try FamilyGraph.createTree(named: "Existing", in: context)
        let payload = validPayload(relationshipTargetID: "missing-person")
        let initialTreeCount = try context.fetchCount(FetchDescriptor<FamilyTree>())

        #expect(throws: HeritgArchiveError.invalidArchive) {
            try FamilyGraph.importArchive(payload, in: context)
        }
        #expect(try context.fetchCount(FetchDescriptor<FamilyTree>()) == initialTreeCount)
        #expect(try context.fetchCount(FetchDescriptor<Person>()) == 0)
        #expect(try context.fetchCount(FetchDescriptor<FamilyRelationship>()) == 0)
    }

    @Test func oldPreReleaseEnvelopeIsNotAccepted() {
        #expect(throws: HeritgArchiveError.invalidArchive) {
            try HeritgArchive.protection(of: Data("HERITG00payload".utf8))
        }
        #expect(throws: HeritgArchiveError.invalidArchive) {
            try HeritgArchive.protection(of: Data("HERITG01payload".utf8))
        }
    }

    private func validPayload(
        relationshipTargetID: String = "person-beta",
        notes: String = "Synthetic notes only"
    ) -> HeritgArchivePayload {
        HeritgArchivePayload(
            schemaVersion: 1,
            exportedAt: instant(1_700_000_000),
            tree: HeritgArchiveTree(
                id: "tree-synthetic",
                title: "Synthetic Family",
                createdAt: instant(1_600_000_000),
                updatedAt: instant(1_700_000_000),
                lastSelectedPersonID: "person-alpha"
            ),
            people: [
                HeritgArchivePerson(
                    id: "person-alpha",
                    treeID: "tree-synthetic",
                    displayName: "Ayu \u{00c9}lodie",
                    genderRaw: PersonGender.female.rawValue,
                    createdAt: instant(1_600_000_100),
                    birthDate: calendarDate(year: 1985, month: 4, day: 12),
                    deathDate: nil,
                    birthDatePrecisionRaw: BirthDatePrecision.exact.rawValue,
                    notes: notes,
                    addressLine: "",
                    city: "Bandung",
                    province: "West Java",
                    country: "Indonesia",
                    postalCode: "40123",
                    profilePhotoData: Data([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
                ),
                HeritgArchivePerson(
                    id: "person-beta",
                    treeID: "tree-synthetic",
                    displayName: "Bima",
                    genderRaw: PersonGender.male.rawValue,
                    createdAt: instant(1_600_000_200),
                    birthDate: calendarDate(year: 1983, month: 9, day: 2),
                    deathDate: nil,
                    birthDatePrecisionRaw: BirthDatePrecision.month.rawValue,
                    notes: "",
                    addressLine: "",
                    city: "",
                    province: "",
                    country: "",
                    postalCode: "",
                    profilePhotoData: nil
                ),
            ],
            relationships: [
                HeritgArchiveRelationship(
                    id: "relationship-alpha-beta",
                    treeID: "tree-synthetic",
                    fromPersonID: "person-alpha",
                    toPersonID: relationshipTargetID,
                    kindRaw: RelationshipKind.partner.rawValue,
                    subtypeRaw: RelationshipSubtype.spouse.rawValue,
                    createdAt: instant(1_650_000_000),
                    marriageDate: calendarDate(year: 2010, month: 6, day: 20)
                ),
            ]
        )
    }

    private func instant(_ seconds: TimeInterval) -> Date {
        Date(timeIntervalSince1970: seconds)
    }

    private func calendarDate(year: Int, month: Int, day: Int) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        return calendar.date(from: DateComponents(year: year, month: month, day: day, hour: 12))!
    }

    private func calendarKey(_ date: Date?) -> String? {
        guard let date else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        let components = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", components.year!, components.month!, components.day!)
    }

    private func sha256(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    @MainActor
    private func makeContext() throws -> ModelContext {
        let schema = Schema([FamilyTree.self, Person.self, FamilyRelationship.self])
        let configuration = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        let container = try ModelContainer(for: schema, configurations: [configuration])
        return ModelContext(container)
    }
}
