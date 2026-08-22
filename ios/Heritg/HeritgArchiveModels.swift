import Foundation

nonisolated struct HeritgArchivePayload: Codable, Sendable {
    let schemaVersion: Int
    let exportedAt: Date
    let tree: HeritgArchiveTree
    let people: [HeritgArchivePerson]
    let relationships: [HeritgArchiveRelationship]
}

nonisolated struct HeritgArchiveTree: Codable, Sendable {
    let id: String
    let title: String
    let createdAt: Date
    let updatedAt: Date
    let lastSelectedPersonID: String?
}

nonisolated struct HeritgArchivePerson: Codable, Sendable {
    let id: String
    let treeID: String
    let displayName: String
    let genderRaw: String
    let createdAt: Date
    let birthDate: Date?
    let deathDate: Date?
    let birthDatePrecisionRaw: String
    let birthOrderOverride: Int?
    let notes: String
    let addressLine: String
    let city: String
    let province: String
    let country: String
    let postalCode: String
    let profilePhotoData: Data?
}

nonisolated struct HeritgArchiveRelationship: Codable, Sendable {
    let id: String
    let treeID: String
    let fromPersonID: String
    let toPersonID: String
    let kindRaw: String
    let subtypeRaw: String
    let createdAt: Date
    let marriageDate: Date?
}

nonisolated struct HeritgArchiveManifest: Codable, Sendable {
    static let format = "heritg-family-archive"
    static let formatVersion = "1.0.0"

    let format: String
    let formatVersion: String
    let schemaVersion: Int
    let createdAt: String
    let treeId: String
    let counts: Counts
    let hashAlgorithm: String

    struct Counts: Codable, Sendable {
        let people: Int
        let relationships: Int
        let media: Int
    }
}

nonisolated struct HeritgArchiveTreeRecord: Codable, Sendable {
    let schemaVersion: Int
    let id: String
    let title: String
    let createdAt: String
    let updatedAt: String
    let lastSelectedPersonId: String?
}

nonisolated struct HeritgArchiveMediaReference: Codable, Sendable {
    let path: String
    let sha256: String
    let mimeType: String
    let byteSize: Int
}

nonisolated struct HeritgArchivePersonRecord: Codable, Sendable {
    let schemaVersion: Int
    let id: String
    let treeId: String
    let displayName: String
    let gender: String
    let createdAt: String
    let birthDate: String?
    let deathDate: String?
    let birthDatePrecision: String
    let birthOrderOverride: Int?
    let notes: String
    let addressLine: String
    let city: String
    let province: String
    let country: String
    let postalCode: String
    let profilePhoto: HeritgArchiveMediaReference?
}

nonisolated struct HeritgArchiveRelationshipRecord: Codable, Sendable {
    let schemaVersion: Int
    let id: String
    let treeId: String
    let fromPersonId: String
    let toPersonId: String
    let kind: String
    let subtype: String
    let createdAt: String
    let marriageDate: String?
}

nonisolated enum HeritgArchiveDates {
    static func instant(_ date: Date) throws -> String {
        guard date.timeIntervalSinceReferenceDate.isFinite else {
            throw HeritgArchiveError.invalidArchive
        }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        return formatter.string(from: date)
    }

    static func parseInstant(_ value: String) throws -> Date {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        guard value.hasSuffix("Z"), let date = formatter.date(from: value),
              formatter.string(from: date) == value else {
            throw HeritgArchiveError.invalidArchive
        }
        return date
    }

    static func calendarDate(_ date: Date?) throws -> String? {
        guard let date else { return nil }
        guard date.timeIntervalSinceReferenceDate.isFinite else {
            throw HeritgArchiveError.invalidArchive
        }
        return dateFormatter().string(from: date)
    }

    static func parseCalendarDate(_ value: String?) throws -> Date? {
        guard let value else { return nil }
        let formatter = dateFormatter()
        guard let date = formatter.date(from: value), formatter.string(from: date) == value else {
            throw HeritgArchiveError.invalidArchive
        }
        return date
    }

    private static func dateFormatter() -> DateFormatter {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false
        return formatter
    }
}
