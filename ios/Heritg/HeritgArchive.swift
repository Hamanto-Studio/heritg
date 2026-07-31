import CommonCrypto
import CryptoKit
import Foundation
import Security
import UniformTypeIdentifiers

extension UTType {
    static let heritgArchive = UTType(filenameExtension: "heritg") ?? .data
}

enum HeritgArchiveError: LocalizedError, Equatable {
    case fileTooLarge
    case invalidArchive
    case unsupportedVersion
    case wrongPasswordOrCorruptArchive
    case tooManyRecords
    case fieldTooLarge
    case photoTooLarge

    var errorDescription: String? {
        switch self {
        case .fileTooLarge:
            String(localized: "The Heritg backup is larger than 32 MB.", locale: AppLanguage.selectedLocale)
        case .invalidArchive:
            String(localized: "The Heritg backup is invalid.", locale: AppLanguage.selectedLocale)
        case .unsupportedVersion:
            String(localized: "This Heritg backup was created by an unsupported app version.", locale: AppLanguage.selectedLocale)
        case .wrongPasswordOrCorruptArchive:
            String(localized: "The password is incorrect or the Heritg backup is damaged.", locale: AppLanguage.selectedLocale)
        case .tooManyRecords:
            String(localized: "The Heritg backup contains too many records.", locale: AppLanguage.selectedLocale)
        case .fieldTooLarge:
            String(localized: "The Heritg backup contains a text field that is too large.", locale: AppLanguage.selectedLocale)
        case .photoTooLarge:
            String(localized: "The Heritg backup contains a photo that is too large.", locale: AppLanguage.selectedLocale)
        }
    }
}

nonisolated enum HeritgArchiveProtection: Equatable, Sendable {
    case encrypted
    case unencrypted
}

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

nonisolated enum HeritgArchive {
    static let maximumFileBytes = 32 * 1_024 * 1_024

    private static let encryptedMagic = Data("HERITG01".utf8)
    private static let unencryptedMagic = Data("HERITG00".utf8)
    private static let envelopeVersion: UInt16 = 1
    private static let payloadVersion = 1
    private static let keyByteCount = 32
    private static let saltByteCount = 16
    private static let nonceByteCount = 12
    private static let tagByteCount = 16
    private static let derivationRounds: UInt32 = 600_000
    private static let minimumDerivationRounds: UInt32 = 100_000
    private static let maximumDerivationRounds: UInt32 = 2_000_000
    private static let maximumPeople = 100_000
    private static let maximumRelationships = 300_000
    private static let maximumShortFieldBytes = 4_096
    private static let maximumNotesBytes = 1_024 * 1_024
    private static let maximumPhotoBytes = 10 * 1_024 * 1_024
    private static let fixedHeaderByteCount = 8 + 2 + 4 + 16 + 12

    @MainActor
    static func payload(
        tree: FamilyTree,
        people: [Person],
        relationships: [FamilyRelationship]
    ) throws -> HeritgArchivePayload {
        let payload = HeritgArchivePayload(
            schemaVersion: payloadVersion,
            exportedAt: .now,
            tree: HeritgArchiveTree(
                id: tree.id,
                title: tree.title,
                createdAt: tree.createdAt,
                updatedAt: tree.updatedAt,
                lastSelectedPersonID: tree.lastSelectedPersonID
            ),
            people: people.map {
                HeritgArchivePerson(
                    id: $0.id,
                    treeID: $0.treeID,
                    displayName: $0.displayName,
                    genderRaw: $0.gender.rawValue,
                    createdAt: $0.createdAt,
                    birthDate: $0.birthDate,
                    deathDate: $0.deathDate,
                    birthDatePrecisionRaw: $0.birthDatePrecision.rawValue,
                    notes: $0.notes,
                    addressLine: $0.addressLine,
                    city: $0.city,
                    province: $0.province,
                    country: $0.country,
                    postalCode: $0.postalCode,
                    profilePhotoData: $0.profilePhotoData
                )
            },
            relationships: relationships.map {
                HeritgArchiveRelationship(
                    id: $0.id,
                    treeID: $0.treeID,
                    fromPersonID: $0.fromPersonID,
                    toPersonID: $0.toPersonID,
                    kindRaw: $0.kind.rawValue,
                    subtypeRaw: $0.subtype.rawValue,
                    createdAt: $0.createdAt,
                    marriageDate: $0.marriageDate
                )
            }
        )
        try validate(payload)
        return payload
    }

    nonisolated static func makeArchive(
        _ payload: HeritgArchivePayload,
        password: String
    ) throws -> Data {
        try validate(payload)
        let plaintext = try encodedPayload(payload)
        guard !password.isEmpty else {
            var archive = unencryptedMagic
            archive.append(bigEndianBytes(envelopeVersion))
            archive.append(plaintext)
            guard archive.count <= maximumFileBytes else { throw HeritgArchiveError.fileTooLarge }
            return archive
        }

        let salt = try randomData(count: saltByteCount)
        let nonceData = try randomData(count: nonceByteCount)
        var header = encryptedMagic
        header.append(bigEndianBytes(envelopeVersion))
        header.append(bigEndianBytes(derivationRounds))
        header.append(salt)
        header.append(nonceData)

        let key = try derivedKey(password: password, salt: salt, rounds: derivationRounds)
        let nonce = try AES.GCM.Nonce(data: nonceData)
        let sealed = try AES.GCM.seal(plaintext, using: key, nonce: nonce, authenticating: header)
        var archive = header
        archive.append(sealed.ciphertext)
        archive.append(sealed.tag)
        guard archive.count <= maximumFileBytes else { throw HeritgArchiveError.fileTooLarge }
        return archive
    }

    nonisolated static func protection(of archive: Data) throws -> HeritgArchiveProtection {
        guard archive.count <= maximumFileBytes else { throw HeritgArchiveError.fileTooLarge }
        guard archive.count >= encryptedMagic.count else { throw HeritgArchiveError.invalidArchive }
        if archive.prefix(encryptedMagic.count) == encryptedMagic { return .encrypted }
        if archive.prefix(unencryptedMagic.count) == unencryptedMagic { return .unencrypted }
        throw HeritgArchiveError.invalidArchive
    }

    nonisolated static func decodeUnencrypted(_ archive: Data) throws -> HeritgArchivePayload {
        guard try protection(of: archive) == .unencrypted,
              archive.count >= unencryptedMagic.count + 2 else {
            throw HeritgArchiveError.invalidArchive
        }
        let version = readUInt16(archive, at: unencryptedMagic.count)
        guard version == envelopeVersion else { throw HeritgArchiveError.unsupportedVersion }
        let payloadData = archive[(unencryptedMagic.count + 2)..<archive.count]
        do {
            let payload = try PropertyListDecoder().decode(HeritgArchivePayload.self, from: payloadData)
            try validate(payload)
            return payload
        } catch let error as HeritgArchiveError {
            throw error
        } catch {
            throw HeritgArchiveError.invalidArchive
        }
    }

    nonisolated static func decrypt(_ archive: Data, password: String) throws -> HeritgArchivePayload {
        guard archive.count <= maximumFileBytes else { throw HeritgArchiveError.fileTooLarge }
        guard archive.count >= fixedHeaderByteCount + tagByteCount,
              archive.prefix(encryptedMagic.count) == encryptedMagic else {
            throw HeritgArchiveError.invalidArchive
        }

        let version = readUInt16(archive, at: encryptedMagic.count)
        guard version == envelopeVersion else { throw HeritgArchiveError.unsupportedVersion }
        let rounds = readUInt32(archive, at: encryptedMagic.count + 2)
        guard rounds >= minimumDerivationRounds, rounds <= maximumDerivationRounds else {
            throw HeritgArchiveError.invalidArchive
        }

        let saltStart = encryptedMagic.count + 2 + 4
        let nonceStart = saltStart + saltByteCount
        let ciphertextStart = nonceStart + nonceByteCount
        let tagStart = archive.count - tagByteCount
        let salt = archive.subdata(in: saltStart..<nonceStart)
        let nonceData = archive.subdata(in: nonceStart..<ciphertextStart)
        let ciphertext = archive[ciphertextStart..<tagStart]
        let tag = archive.subdata(in: tagStart..<archive.count)
        let header = archive.prefix(fixedHeaderByteCount)

        do {
            let key = try derivedKey(password: password, salt: salt, rounds: rounds)
            let box = try AES.GCM.SealedBox(
                nonce: AES.GCM.Nonce(data: nonceData),
                ciphertext: ciphertext,
                tag: tag
            )
            let plaintext = try AES.GCM.open(box, using: key, authenticating: header)
            let payload = try PropertyListDecoder().decode(HeritgArchivePayload.self, from: plaintext)
            try validate(payload)
            return payload
        } catch let error as HeritgArchiveError {
            throw error
        } catch {
            throw HeritgArchiveError.wrongPasswordOrCorruptArchive
        }
    }

    private nonisolated static func encodedPayload(_ payload: HeritgArchivePayload) throws -> Data {
        let encoder = PropertyListEncoder()
        encoder.outputFormat = .binary
        let data = try encoder.encode(payload)
        guard data.count <= maximumFileBytes else { throw HeritgArchiveError.fileTooLarge }
        return data
    }

    nonisolated static func validate(_ payload: HeritgArchivePayload) throws {
        guard payload.schemaVersion == payloadVersion else { throw HeritgArchiveError.unsupportedVersion }
        guard payload.people.count <= maximumPeople,
              payload.relationships.count <= maximumRelationships else {
            throw HeritgArchiveError.tooManyRecords
        }
        try validateShort(payload.tree.id)
        try validateShort(payload.tree.title, allowsEmpty: false)

        let personIDs = Set(payload.people.map(\.id))
        guard personIDs.count == payload.people.count else { throw HeritgArchiveError.invalidArchive }
        if let selectedID = payload.tree.lastSelectedPersonID, !personIDs.contains(selectedID) {
            throw HeritgArchiveError.invalidArchive
        }

        var totalPhotoBytes = 0
        for person in payload.people {
            guard person.treeID == payload.tree.id,
                  PersonGender(rawValue: person.genderRaw) != nil,
                  BirthDatePrecision(rawValue: person.birthDatePrecisionRaw) != nil,
                  person.birthDate == nil || person.deathDate == nil || person.deathDate! >= person.birthDate! else {
                throw HeritgArchiveError.invalidArchive
            }
            try validateShort(person.id, allowsEmpty: false)
            try validateShort(person.displayName, allowsEmpty: false)
            try validateShort(person.addressLine)
            try validateShort(person.city)
            try validateShort(person.province)
            try validateShort(person.country)
            try validateShort(person.postalCode)
            guard person.notes.utf8.count <= maximumNotesBytes else { throw HeritgArchiveError.fieldTooLarge }
            if let photo = person.profilePhotoData {
                guard photo.count <= maximumPhotoBytes else { throw HeritgArchiveError.photoTooLarge }
                totalPhotoBytes += photo.count
                guard totalPhotoBytes <= maximumFileBytes else { throw HeritgArchiveError.fileTooLarge }
            }
        }

        let relationshipIDs = Set(payload.relationships.map(\.id))
        guard relationshipIDs.count == payload.relationships.count else {
            throw HeritgArchiveError.invalidArchive
        }
        var relationshipSignatures = Set<String>()
        for relationship in payload.relationships {
            guard relationship.treeID == payload.tree.id,
                  relationship.fromPersonID != relationship.toPersonID,
                  personIDs.contains(relationship.fromPersonID),
                  personIDs.contains(relationship.toPersonID),
                  let kind = RelationshipKind(rawValue: relationship.kindRaw),
                  let subtype = RelationshipSubtype(rawValue: relationship.subtypeRaw),
                  subtypeIsValid(subtype, for: kind) else {
                throw HeritgArchiveError.invalidArchive
            }
            try validateShort(relationship.id, allowsEmpty: false)
            let endpoints = kind == .parent
                ? [relationship.fromPersonID, relationship.toPersonID]
                : [relationship.fromPersonID, relationship.toPersonID].sorted()
            guard relationshipSignatures.insert(
                "\(kind.rawValue)|\(endpoints[0])|\(endpoints[1])"
            ).inserted else {
                throw HeritgArchiveError.invalidArchive
            }
        }
    }

    private nonisolated static func subtypeIsValid(
        _ subtype: RelationshipSubtype,
        for kind: RelationshipKind
    ) -> Bool {
        switch kind {
        case .parent:
            [.biologicalParent, .adoptiveParent, .fosterParent, .guardian, .stepParent].contains(subtype)
        case .partner:
            [.partner, .spouse, .formerPartner, .formerSpouse].contains(subtype)
        case .sibling:
            [.sibling, .halfSibling, .adoptiveSibling, .fosterSibling, .stepSibling].contains(subtype)
        }
    }

    private nonisolated static func validateShort(
        _ value: String,
        allowsEmpty: Bool = true
    ) throws {
        guard value.utf8.count <= maximumShortFieldBytes else { throw HeritgArchiveError.fieldTooLarge }
        if !allowsEmpty, value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            throw HeritgArchiveError.invalidArchive
        }
    }

    private nonisolated static func derivedKey(
        password: String,
        salt: Data,
        rounds: UInt32
    ) throws -> SymmetricKey {
        let passwordData = Data(password.utf8)
        var keyBytes = [UInt8](repeating: 0, count: keyByteCount)
        defer { keyBytes.resetBytes(in: keyBytes.indices) }
        let status = passwordData.withUnsafeBytes { passwordBuffer in
            salt.withUnsafeBytes { saltBuffer in
                CCKeyDerivationPBKDF(
                    CCPBKDFAlgorithm(kCCPBKDF2),
                    passwordBuffer.baseAddress?.assumingMemoryBound(to: Int8.self),
                    passwordData.count,
                    saltBuffer.baseAddress?.assumingMemoryBound(to: UInt8.self),
                    salt.count,
                    CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256),
                    rounds,
                    &keyBytes,
                    keyBytes.count
                )
            }
        }
        guard status == kCCSuccess else { throw HeritgArchiveError.invalidArchive }
        return SymmetricKey(data: keyBytes)
    }

    private nonisolated static func randomData(count: Int) throws -> Data {
        var bytes = [UInt8](repeating: 0, count: count)
        let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        guard status == errSecSuccess else { throw HeritgArchiveError.invalidArchive }
        return Data(bytes)
    }

    private nonisolated static func bigEndianBytes<T: FixedWidthInteger>(_ value: T) -> Data {
        var value = value.bigEndian
        return withUnsafeBytes(of: &value) { Data($0) }
    }

    private nonisolated static func readUInt16(_ data: Data, at offset: Int) -> UInt16 {
        data[offset..<(offset + 2)].reduce(UInt16(0)) { ($0 << 8) | UInt16($1) }
    }

    private nonisolated static func readUInt32(_ data: Data, at offset: Int) -> UInt32 {
        data[offset..<(offset + 4)].reduce(UInt32(0)) { ($0 << 8) | UInt32($1) }
    }
}
