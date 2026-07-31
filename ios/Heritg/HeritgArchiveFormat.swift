import CryptoKit
import Foundation

nonisolated enum HeritgArchiveFormat {
    private struct MediaValue {
        let reference: HeritgArchiveMediaReference
        let data: Data
    }

    private static let manifestPath = "manifest.json"
    private static let treePath = "tree.json"
    private static let peoplePath = "people.jsonl"
    private static let relationshipsPath = "relationships.jsonl"
    private static let checksumsPath = "checksums.sha256"

    static func encode(_ payload: HeritgArchivePayload) throws -> Data {
        try HeritgArchive.validate(payload)
        var mediaByHash = [String: MediaValue]()
        var peopleRecords = [HeritgArchivePersonRecord]()
        for person in payload.people {
            var photoReference: HeritgArchiveMediaReference?
            if let photo = person.profilePhotoData {
                let info = mediaInfo(photo)
                if let existing = mediaByHash[info.reference.sha256], existing.data != photo {
                    throw HeritgArchiveError.invalidArchive
                }
                mediaByHash[info.reference.sha256] = info
                photoReference = info.reference
            }
            peopleRecords.append(HeritgArchivePersonRecord(
                schemaVersion: HeritgArchive.schemaVersion,
                id: person.id,
                treeId: person.treeID,
                displayName: person.displayName,
                gender: person.genderRaw,
                createdAt: try HeritgArchiveDates.instant(person.createdAt),
                birthDate: try HeritgArchiveDates.calendarDate(person.birthDate),
                deathDate: try HeritgArchiveDates.calendarDate(person.deathDate),
                birthDatePrecision: person.birthDatePrecisionRaw,
                notes: person.notes,
                addressLine: person.addressLine,
                city: person.city,
                province: person.province,
                country: person.country,
                postalCode: person.postalCode,
                profilePhoto: photoReference
            ))
        }
        guard mediaByHash.count <= HeritgArchive.maximumMediaFiles else {
            throw HeritgArchiveError.tooManyRecords
        }

        let manifest = HeritgArchiveManifest(
            format: HeritgArchiveManifest.format,
            formatVersion: HeritgArchiveManifest.formatVersion,
            schemaVersion: HeritgArchive.schemaVersion,
            createdAt: try HeritgArchiveDates.instant(payload.exportedAt),
            treeId: payload.tree.id,
            counts: .init(
                people: payload.people.count,
                relationships: payload.relationships.count,
                media: mediaByHash.count
            ),
            hashAlgorithm: "sha256"
        )
        let tree = HeritgArchiveTreeRecord(
            schemaVersion: HeritgArchive.schemaVersion,
            id: payload.tree.id,
            title: payload.tree.title,
            createdAt: try HeritgArchiveDates.instant(payload.tree.createdAt),
            updatedAt: try HeritgArchiveDates.instant(payload.tree.updatedAt),
            lastSelectedPersonId: payload.tree.lastSelectedPersonID
        )
        let relationships = try payload.relationships.map {
            HeritgArchiveRelationshipRecord(
                schemaVersion: HeritgArchive.schemaVersion,
                id: $0.id,
                treeId: $0.treeID,
                fromPersonId: $0.fromPersonID,
                toPersonId: $0.toPersonID,
                kind: $0.kindRaw,
                subtype: $0.subtypeRaw,
                createdAt: try HeritgArchiveDates.instant($0.createdAt),
                marriageDate: try HeritgArchiveDates.calendarDate($0.marriageDate)
            )
        }

        var files = [String: Data]()
        files[manifestPath] = try encodeJSON(manifest)
        files[treePath] = try encodeJSON(tree)
        files[peoplePath] = try encodeJSONLines(peopleRecords)
        files[relationshipsPath] = try encodeJSONLines(relationships)
        for media in mediaByHash.values { files[media.reference.path] = media.data }
        files[checksumsPath] = checksumFile(for: files)
        return try HeritgZIP.encode(files.map { .init(path: $0.key, data: $0.value) })
    }

    static func decode(_ archive: Data) throws -> HeritgArchivePayload {
        let files = try HeritgZIP.decode(archive)
        guard files.count <= HeritgArchive.maximumMediaFiles + 5,
              let checksums = files[checksumsPath] else {
            throw HeritgArchiveError.invalidArchive
        }
        try verifyChecksums(checksums, files: files)

        let required = Set([manifestPath, treePath, peoplePath, relationshipsPath, checksumsPath])
        let mediaPaths = Set(files.keys.filter { $0.hasPrefix("media/") })
        guard Set(files.keys) == required.union(mediaPaths),
              mediaPaths.count <= HeritgArchive.maximumMediaFiles,
              let manifestData = files[manifestPath],
              let treeData = files[treePath],
              let peopleData = files[peoplePath],
              let relationshipData = files[relationshipsPath] else {
            throw HeritgArchiveError.invalidArchive
        }

        let manifest: HeritgArchiveManifest = try decodeJSON(manifestData)
        guard manifest.format == HeritgArchiveManifest.format,
              manifest.formatVersion == HeritgArchiveManifest.formatVersion,
              manifest.schemaVersion == HeritgArchive.schemaVersion,
              manifest.hashAlgorithm == "sha256" else {
            if manifest.format == HeritgArchiveManifest.format,
               manifest.formatVersion != HeritgArchiveManifest.formatVersion ||
                manifest.schemaVersion != HeritgArchive.schemaVersion {
                throw HeritgArchiveError.unsupportedVersion
            }
            throw HeritgArchiveError.invalidArchive
        }
        let treeRecord: HeritgArchiveTreeRecord = try decodeJSON(treeData)
        let peopleRecords: [HeritgArchivePersonRecord] = try decodeJSONLines(
            peopleData,
            maximumRecords: HeritgArchive.maximumPeople
        )
        let relationshipRecords: [HeritgArchiveRelationshipRecord] = try decodeJSONLines(
            relationshipData,
            maximumRecords: HeritgArchive.maximumRelationships
        )
        guard treeRecord.schemaVersion == HeritgArchive.schemaVersion,
              manifest.treeId == treeRecord.id,
              manifest.counts.people == peopleRecords.count,
              manifest.counts.relationships == relationshipRecords.count,
              manifest.counts.media == mediaPaths.count else {
            throw HeritgArchiveError.invalidArchive
        }

        var referencedMedia = Set<String>()
        let people = try peopleRecords.map { record in
            guard record.schemaVersion == HeritgArchive.schemaVersion else {
                throw HeritgArchiveError.unsupportedVersion
            }
            var photo: Data?
            if let reference = record.profilePhoto {
                guard let media = files[reference.path],
                      media.count == reference.byteSize else {
                    throw HeritgArchiveError.invalidArchive
                }
                let actual = mediaInfo(media).reference
                guard reference.path == actual.path,
                      reference.sha256 == actual.sha256,
                      reference.mimeType == actual.mimeType else {
                    throw HeritgArchiveError.invalidArchive
                }
                referencedMedia.insert(reference.path)
                photo = media
            }
            return HeritgArchivePerson(
                id: record.id,
                treeID: record.treeId,
                displayName: record.displayName,
                genderRaw: record.gender,
                createdAt: try HeritgArchiveDates.parseInstant(record.createdAt),
                birthDate: try HeritgArchiveDates.parseCalendarDate(record.birthDate),
                deathDate: try HeritgArchiveDates.parseCalendarDate(record.deathDate),
                birthDatePrecisionRaw: record.birthDatePrecision,
                notes: record.notes,
                addressLine: record.addressLine,
                city: record.city,
                province: record.province,
                country: record.country,
                postalCode: record.postalCode,
                profilePhotoData: photo
            )
        }
        guard referencedMedia == mediaPaths else { throw HeritgArchiveError.invalidArchive }

        let relationships = try relationshipRecords.map { record in
            guard record.schemaVersion == HeritgArchive.schemaVersion else {
                throw HeritgArchiveError.unsupportedVersion
            }
            return HeritgArchiveRelationship(
                id: record.id,
                treeID: record.treeId,
                fromPersonID: record.fromPersonId,
                toPersonID: record.toPersonId,
                kindRaw: record.kind,
                subtypeRaw: record.subtype,
                createdAt: try HeritgArchiveDates.parseInstant(record.createdAt),
                marriageDate: try HeritgArchiveDates.parseCalendarDate(record.marriageDate)
            )
        }
        let payload = HeritgArchivePayload(
            schemaVersion: manifest.schemaVersion,
            exportedAt: try HeritgArchiveDates.parseInstant(manifest.createdAt),
            tree: HeritgArchiveTree(
                id: treeRecord.id,
                title: treeRecord.title,
                createdAt: try HeritgArchiveDates.parseInstant(treeRecord.createdAt),
                updatedAt: try HeritgArchiveDates.parseInstant(treeRecord.updatedAt),
                lastSelectedPersonID: treeRecord.lastSelectedPersonId
            ),
            people: people,
            relationships: relationships
        )
        try HeritgArchive.validate(payload)
        return payload
    }

    private static func encodeJSON<T: Encodable>(_ value: T) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        do {
            let data = try encoder.encode(value)
            guard data.count <= HeritgArchive.maximumFileBytes else {
                throw HeritgArchiveError.fileTooLarge
            }
            return data
        } catch let error as HeritgArchiveError {
            throw error
        } catch {
            throw HeritgArchiveError.invalidArchive
        }
    }

    private static func decodeJSON<T: Decodable>(_ data: Data) throws -> T {
        guard data.count <= HeritgArchive.maximumFileBytes else {
            throw HeritgArchiveError.fileTooLarge
        }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw HeritgArchiveError.invalidArchive
        }
    }

    private static func encodeJSONLines<T: Encodable>(_ records: [T]) throws -> Data {
        var result = Data()
        for record in records {
            result.append(try encodeJSON(record))
            result.append(0x0a)
            guard result.count <= HeritgArchive.maximumFileBytes else {
                throw HeritgArchiveError.fileTooLarge
            }
        }
        return result
    }

    private static func decodeJSONLines<T: Decodable>(
        _ data: Data,
        maximumRecords: Int
    ) throws -> [T] {
        guard !data.isEmpty else { return [] }
        guard data.last == 0x0a else { throw HeritgArchiveError.invalidArchive }
        let lines = data.split(separator: 0x0a, omittingEmptySubsequences: false)
        guard lines.last?.isEmpty == true, lines.count - 1 <= maximumRecords else {
            throw HeritgArchiveError.tooManyRecords
        }
        return try lines.dropLast().map { line in
            guard !line.isEmpty,
                  line.count <= HeritgArchive.maximumNotesBytes + 10 * HeritgArchive.maximumShortFieldBytes else {
                throw HeritgArchiveError.fieldTooLarge
            }
            return try decodeJSON(Data(line))
        }
    }

    private static func checksumFile(for files: [String: Data]) -> Data {
        let contents = files.keys.sorted().map { path in
            "\(sha256(files[path]!))  \(path)\n"
        }.joined()
        return Data(contents.utf8)
    }

    private static func verifyChecksums(_ checksumData: Data, files: [String: Data]) throws {
        guard checksumData.last == 0x0a,
              let contents = String(data: checksumData, encoding: .utf8),
              !contents.contains("\r") else {
            throw HeritgArchiveError.invalidArchive
        }
        let lines = contents.split(separator: "\n", omittingEmptySubsequences: false)
        guard lines.last?.isEmpty == true else { throw HeritgArchiveError.invalidArchive }
        var listed = Set<String>()
        for line in lines.dropLast() {
            let bytes = Array(line.utf8)
            guard !line.isEmpty, bytes.count > 66,
                  bytes[64] == 0x20, bytes[65] == 0x20,
                  bytes[0..<64].allSatisfy({ (0x30...0x39).contains($0) || (0x61...0x66).contains($0) }),
                  let path = String(bytes: bytes[66...], encoding: .utf8),
                  path != checksumsPath,
                  let data = files[path],
                  listed.insert(path).inserted,
                  String(bytes: bytes[0..<64], encoding: .utf8) == sha256(data) else {
                throw HeritgArchiveError.invalidArchive
            }
        }
        guard listed == Set(files.keys).subtracting([checksumsPath]) else {
            throw HeritgArchiveError.invalidArchive
        }
    }

    private static func mediaInfo(_ data: Data) -> MediaValue {
        let digest = sha256(data)
        let type: (extension: String, mime: String)
        if data.starts(with: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) {
            type = ("png", "image/png")
        } else if data.starts(with: [0xff, 0xd8, 0xff]) {
            type = ("jpg", "image/jpeg")
        } else if data.starts(with: Data("GIF87a".utf8)) || data.starts(with: Data("GIF89a".utf8)) {
            type = ("gif", "image/gif")
        } else if data.count >= 12,
                  data[0..<4] == Data("RIFF".utf8),
                  data[8..<12] == Data("WEBP".utf8) {
            type = ("webp", "image/webp")
        } else if data.count >= 12,
                  data[4..<8] == Data("ftyp".utf8),
                  ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].contains(String(data: data[8..<12], encoding: .ascii)) {
            type = ("heic", "image/heic")
        } else {
            type = ("bin", "application/octet-stream")
        }
        let reference = HeritgArchiveMediaReference(
            path: "media/\(digest).\(type.extension)",
            sha256: digest,
            mimeType: type.mime,
            byteSize: data.count
        )
        return MediaValue(reference: reference, data: data)
    }

    private static func sha256(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }
}
