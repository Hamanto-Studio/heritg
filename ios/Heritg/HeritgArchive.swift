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
    case unsupportedFileType
    case unsupportedVersion
    case wrongPasswordOrCorruptArchive
    case tooManyRecords
    case fieldTooLarge
    case photoTooLarge
    case identifierCollision

    var errorDescription: String? {
        switch self {
        case .fileTooLarge:
            String(localized: "The Heritg backup is larger than 32 MB.", locale: AppLanguage.selectedLocale)
        case .invalidArchive:
            String(localized: "The Heritg backup is invalid.", locale: AppLanguage.selectedLocale)
        case .unsupportedFileType:
            String(localized: "Choose a .heritg backup file.", locale: AppLanguage.selectedLocale)
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
        case .identifierCollision:
            String(localized: "This Heritg backup uses an identifier that already exists.", locale: AppLanguage.selectedLocale)
        }
    }
}

nonisolated enum HeritgArchiveProtection: Equatable, Sendable {
    case encrypted
    case unencrypted
}

nonisolated enum ArchivePasswordPolicy {
    static let minimumCodePoints = 8

    struct Requirements {
        let minimumLength: Bool
        let lowercase: Bool
        let uppercase: Bool
        let number: Bool
        let special: Bool

        var allMet: Bool { minimumLength && lowercase && uppercase && number && special }
    }

    static func requirements(for password: String) -> Requirements {
        let normalized = password.precomposedStringWithCanonicalMapping
        let scalars = normalized.unicodeScalars
        return Requirements(
            minimumLength: scalars.count >= minimumCodePoints,
            lowercase: scalars.contains { $0.properties.generalCategory == .lowercaseLetter },
            uppercase: scalars.contains { $0.properties.generalCategory == .uppercaseLetter },
            number: scalars.contains { $0.properties.generalCategory == .decimalNumber },
            special: scalars.contains {
                switch $0.properties.generalCategory {
                case .connectorPunctuation, .dashPunctuation, .openPunctuation, .closePunctuation,
                     .initialPunctuation, .finalPunctuation, .otherPunctuation, .mathSymbol,
                     .currencySymbol, .modifierSymbol, .otherSymbol:
                    true
                default:
                    false
                }
            }
        )
    }

    static func accepts(_ password: String) -> Bool {
        guard !password.isEmpty else { return true }
        return requirements(for: password).allMet
    }
}

nonisolated enum HeritgArchive {
    static let maximumFileBytes = 32 * 1_024 * 1_024
    static let maximumPeople = 100_000
    static let maximumRelationships = 300_000
    static let maximumShortFieldBytes = 4_096
    static let maximumNotesBytes = 1_024 * 1_024
    static let maximumPhotoBytes = 10 * 1_024 * 1_024
    static let maximumMediaFiles = 50_000
    static let schemaVersion = 1

    private static let encryptedMagic = Data("HTGENC01".utf8)
    private static let zipMagic = Data([0x50, 0x4b, 0x03, 0x04])
    private static let envelopeVersion: UInt16 = 1
    private static let kdfIdentifier: UInt8 = 1
    private static let cipherIdentifier: UInt8 = 1
    private static let derivationRounds: UInt32 = 600_000
    private static let keyByteCount = 32
    private static let saltByteCount = 16
    private static let nonceByteCount = 12
    private static let tagByteCount = 16
    private static let headerByteCount = 8 + 2 + 1 + 1 + 4 + 16 + 12

    @MainActor
    static func payload(
        tree: FamilyTree,
        people: [Person],
        relationships: [FamilyRelationship]
    ) throws -> HeritgArchivePayload {
        let payload = HeritgArchivePayload(
            schemaVersion: schemaVersion,
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

    static func makeArchive(_ payload: HeritgArchivePayload, password: String) throws -> Data {
        let zip = try HeritgArchiveFormat.encode(payload)
        return try encrypt(zip, password: password, salt: randomData(count: saltByteCount), nonce: randomData(count: nonceByteCount))
    }

    // Internal deterministic entry point for published compatibility vectors and tests.
    static func makeArchive(
        _ payload: HeritgArchivePayload,
        password: String,
        salt: Data,
        nonce: Data
    ) throws -> Data {
        let zip = try HeritgArchiveFormat.encode(payload)
        return try encrypt(zip, password: password, salt: salt, nonce: nonce)
    }

    static func protection(of archive: Data) throws -> HeritgArchiveProtection {
        guard archive.count <= maximumFileBytes else { throw HeritgArchiveError.fileTooLarge }
        if archive.starts(with: encryptedMagic) { return .encrypted }
        if archive.starts(with: zipMagic) { return .unencrypted }
        throw HeritgArchiveError.invalidArchive
    }

    static func decodeUnencrypted(_ archive: Data) throws -> HeritgArchivePayload {
        guard try protection(of: archive) == .unencrypted else {
            throw HeritgArchiveError.invalidArchive
        }
        return try HeritgArchiveFormat.decode(archive)
    }

    static func decrypt(_ archive: Data, password: String) throws -> HeritgArchivePayload {
        guard archive.count <= maximumFileBytes else { throw HeritgArchiveError.fileTooLarge }
        guard archive.count >= headerByteCount + tagByteCount,
              archive.starts(with: encryptedMagic) else {
            throw HeritgArchiveError.invalidArchive
        }
        guard readUInt16(archive, at: 8) == envelopeVersion else {
            throw HeritgArchiveError.unsupportedVersion
        }
        guard archive[10] == kdfIdentifier,
              archive[11] == cipherIdentifier,
              readUInt32(archive, at: 12) == derivationRounds else {
            throw HeritgArchiveError.invalidArchive
        }

        let salt = archive.subdata(in: 16..<32)
        let nonceData = archive.subdata(in: 32..<44)
        let ciphertext = archive[headerByteCount..<(archive.count - tagByteCount)]
        let tag = archive.subdata(in: (archive.count - tagByteCount)..<archive.count)
        let plaintext: Data
        do {
            let key = try derivedKey(password: password, salt: salt)
            let box = try AES.GCM.SealedBox(
                nonce: AES.GCM.Nonce(data: nonceData),
                ciphertext: ciphertext,
                tag: tag
            )
            plaintext = try AES.GCM.open(box, using: key, authenticating: archive.prefix(headerByteCount))
        } catch {
            throw HeritgArchiveError.wrongPasswordOrCorruptArchive
        }
        return try HeritgArchiveFormat.decode(plaintext)
    }

    private static func encrypt(
        _ plaintext: Data,
        password: String,
        salt: Data,
        nonce: Data
    ) throws -> Data {
        guard salt.count == saltByteCount, nonce.count == nonceByteCount else {
            throw HeritgArchiveError.invalidArchive
        }
        var header = encryptedMagic
        header.append(bigEndianBytes(envelopeVersion))
        header.append(kdfIdentifier)
        header.append(cipherIdentifier)
        header.append(bigEndianBytes(derivationRounds))
        header.append(salt)
        header.append(nonce)

        let key = try derivedKey(password: password, salt: salt)
        let sealed = try AES.GCM.seal(
            plaintext,
            using: key,
            nonce: AES.GCM.Nonce(data: nonce),
            authenticating: header
        )
        var archive = header
        archive.append(sealed.ciphertext)
        archive.append(sealed.tag)
        guard archive.count <= maximumFileBytes else { throw HeritgArchiveError.fileTooLarge }
        return archive
    }

    private static func derivedKey(password: String, salt: Data) throws -> SymmetricKey {
        let normalized = password.precomposedStringWithCanonicalMapping
        let passwordData = Data(normalized.utf8)
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
                    derivationRounds,
                    &keyBytes,
                    keyBytes.count
                )
            }
        }
        guard status == kCCSuccess else { throw HeritgArchiveError.invalidArchive }
        return SymmetricKey(data: keyBytes)
    }

    private static func randomData(count: Int) throws -> Data {
        var bytes = [UInt8](repeating: 0, count: count)
        guard SecRandomCopyBytes(kSecRandomDefault, count, &bytes) == errSecSuccess else {
            throw HeritgArchiveError.invalidArchive
        }
        return Data(bytes)
    }

    private static func bigEndianBytes<T: FixedWidthInteger>(_ value: T) -> Data {
        var value = value.bigEndian
        return withUnsafeBytes(of: &value) { Data($0) }
    }

    private static func readUInt16(_ data: Data, at offset: Int) -> UInt16 {
        data[offset..<(offset + 2)].reduce(UInt16(0)) { ($0 << 8) | UInt16($1) }
    }

    private static func readUInt32(_ data: Data, at offset: Int) -> UInt32 {
        data[offset..<(offset + 4)].reduce(UInt32(0)) { ($0 << 8) | UInt32($1) }
    }
}
