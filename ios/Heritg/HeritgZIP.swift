import Foundation

nonisolated enum HeritgZIP {
    struct Entry: Sendable {
        let path: String
        let data: Data
    }

    private struct CentralEntry {
        let path: String
        let crc32: UInt32
        let size: Int
        let localOffset: Int
    }

    private static let crcTable: [UInt32] = (0..<256).map { index in
        var value = UInt32(index)
        for _ in 0..<8 { value = (value >> 1) ^ (value & 1 == 1 ? 0xedb88320 : 0) }
        return value
    }

    static func encode(_ entries: [Entry]) throws -> Data {
        guard entries.count <= Int(UInt16.max) else { throw HeritgArchiveError.tooManyRecords }
        let sorted = entries.sorted { $0.path < $1.path }
        guard Set(sorted.map(\.path)).count == sorted.count else {
            throw HeritgArchiveError.invalidArchive
        }

        var archive = Data()
        var centralRecords = [(entry: Entry, crc: UInt32, offset: UInt32)]()
        for entry in sorted {
            try validate(path: entry.path)
            guard entry.data.count <= Int(UInt32.max), archive.count <= Int(UInt32.max) else {
                throw HeritgArchiveError.fileTooLarge
            }
            let name = Data(entry.path.utf8)
            guard name.count <= Int(UInt16.max) else { throw HeritgArchiveError.fieldTooLarge }
            let crc = crc32(entry.data)
            centralRecords.append((entry, crc, UInt32(archive.count)))
            archive.appendZIPUInt32(0x04034b50)
            archive.appendZIPUInt16(20)
            archive.appendZIPUInt16(0x0800)
            archive.appendZIPUInt16(0)
            archive.appendZIPUInt16(0)
            archive.appendZIPUInt16(0x0021)
            archive.appendZIPUInt32(crc)
            archive.appendZIPUInt32(UInt32(entry.data.count))
            archive.appendZIPUInt32(UInt32(entry.data.count))
            archive.appendZIPUInt16(UInt16(name.count))
            archive.appendZIPUInt16(0)
            archive.append(name)
            archive.append(entry.data)
        }

        guard archive.count <= Int(UInt32.max) else { throw HeritgArchiveError.fileTooLarge }
        let centralOffset = UInt32(archive.count)
        for record in centralRecords {
            let name = Data(record.entry.path.utf8)
            archive.appendZIPUInt32(0x02014b50)
            archive.appendZIPUInt16(20)
            archive.appendZIPUInt16(20)
            archive.appendZIPUInt16(0x0800)
            archive.appendZIPUInt16(0)
            archive.appendZIPUInt16(0)
            archive.appendZIPUInt16(0x0021)
            archive.appendZIPUInt32(record.crc)
            archive.appendZIPUInt32(UInt32(record.entry.data.count))
            archive.appendZIPUInt32(UInt32(record.entry.data.count))
            archive.appendZIPUInt16(UInt16(name.count))
            archive.appendZIPUInt16(0)
            archive.appendZIPUInt16(0)
            archive.appendZIPUInt16(0)
            archive.appendZIPUInt16(0)
            archive.appendZIPUInt32(0)
            archive.appendZIPUInt32(record.offset)
            archive.append(name)
        }
        let centralSize = archive.count - Int(centralOffset)
        guard centralSize <= Int(UInt32.max) else { throw HeritgArchiveError.fileTooLarge }
        archive.appendZIPUInt32(0x06054b50)
        archive.appendZIPUInt16(0)
        archive.appendZIPUInt16(0)
        archive.appendZIPUInt16(UInt16(centralRecords.count))
        archive.appendZIPUInt16(UInt16(centralRecords.count))
        archive.appendZIPUInt32(UInt32(centralSize))
        archive.appendZIPUInt32(centralOffset)
        archive.appendZIPUInt16(0)
        guard archive.count <= HeritgArchive.maximumFileBytes else {
            throw HeritgArchiveError.fileTooLarge
        }
        return archive
    }

    static func decode(_ archive: Data) throws -> [String: Data] {
        guard archive.count <= HeritgArchive.maximumFileBytes else {
            throw HeritgArchiveError.fileTooLarge
        }
        guard archive.count >= 22 else { throw HeritgArchiveError.invalidArchive }
        let endOffset = archive.count - 22
        guard try archive.zipUInt32(at: endOffset) == 0x06054b50,
              try archive.zipUInt16(at: endOffset + 4) == 0,
              try archive.zipUInt16(at: endOffset + 6) == 0,
              try archive.zipUInt16(at: endOffset + 8) == archive.zipUInt16(at: endOffset + 10),
              try archive.zipUInt16(at: endOffset + 20) == 0 else {
            throw HeritgArchiveError.invalidArchive
        }
        let entryCount = Int(try archive.zipUInt16(at: endOffset + 10))
        let centralSize = Int(try archive.zipUInt32(at: endOffset + 12))
        let centralOffset = Int(try archive.zipUInt32(at: endOffset + 16))
        guard centralOffset + centralSize == endOffset else {
            throw HeritgArchiveError.invalidArchive
        }

        var centralEntries = [CentralEntry]()
        var cursor = centralOffset
        var names = Set<String>()
        for _ in 0..<entryCount {
            guard try archive.zipUInt32(at: cursor) == 0x02014b50 else {
                throw HeritgArchiveError.invalidArchive
            }
            let madeBy = try archive.zipUInt16(at: cursor + 4)
            let flags = try archive.zipUInt16(at: cursor + 8)
            let method = try archive.zipUInt16(at: cursor + 10)
            let crc = try archive.zipUInt32(at: cursor + 16)
            let compressedSize = Int(try archive.zipUInt32(at: cursor + 20))
            let size = Int(try archive.zipUInt32(at: cursor + 24))
            let nameLength = Int(try archive.zipUInt16(at: cursor + 28))
            let extraLength = Int(try archive.zipUInt16(at: cursor + 30))
            let commentLength = Int(try archive.zipUInt16(at: cursor + 32))
            let disk = try archive.zipUInt16(at: cursor + 34)
            let externalAttributes = try archive.zipUInt32(at: cursor + 38)
            let localOffset = Int(try archive.zipUInt32(at: cursor + 42))
            guard flags == 0x0800, method == 0, compressedSize == size,
                  extraLength == 0, commentLength == 0, disk == 0 else {
                throw HeritgArchiveError.invalidArchive
            }
            if madeBy >> 8 == 3 {
                let fileType = (externalAttributes >> 16) & 0xf000
                guard fileType == 0 || fileType == 0x8000 else {
                    throw HeritgArchiveError.invalidArchive
                }
            }
            let nameStart = cursor + 46
            let nameData = try archive.zipData(in: nameStart..<(nameStart + nameLength))
            guard let path = String(data: nameData, encoding: .utf8) else {
                throw HeritgArchiveError.invalidArchive
            }
            try validate(path: path)
            guard names.insert(path).inserted else { throw HeritgArchiveError.invalidArchive }
            centralEntries.append(CentralEntry(path: path, crc32: crc, size: size, localOffset: localOffset))
            cursor = nameStart + nameLength
        }
        guard cursor == endOffset else { throw HeritgArchiveError.invalidArchive }

        var result = [String: Data]()
        var localRanges = [Range<Int>]()
        var totalSize = 0
        for entry in centralEntries {
            let offset = entry.localOffset
            guard try archive.zipUInt32(at: offset) == 0x04034b50,
                  try archive.zipUInt16(at: offset + 6) == 0x0800,
                  try archive.zipUInt16(at: offset + 8) == 0,
                  try archive.zipUInt32(at: offset + 14) == entry.crc32,
                  Int(try archive.zipUInt32(at: offset + 18)) == entry.size,
                  Int(try archive.zipUInt32(at: offset + 22)) == entry.size else {
                throw HeritgArchiveError.invalidArchive
            }
            let nameLength = Int(try archive.zipUInt16(at: offset + 26))
            let extraLength = Int(try archive.zipUInt16(at: offset + 28))
            guard extraLength == 0 else { throw HeritgArchiveError.invalidArchive }
            let nameStart = offset + 30
            let dataStart = nameStart + nameLength
            let end = dataStart + entry.size
            guard end <= centralOffset,
                  String(data: try archive.zipData(in: nameStart..<dataStart), encoding: .utf8) == entry.path else {
                throw HeritgArchiveError.invalidArchive
            }
            let data = try archive.zipData(in: dataStart..<end)
            guard crc32(data) == entry.crc32 else { throw HeritgArchiveError.invalidArchive }
            totalSize += data.count
            guard totalSize <= HeritgArchive.maximumFileBytes else {
                throw HeritgArchiveError.fileTooLarge
            }
            localRanges.append(offset..<end)
            result[entry.path] = data
        }
        var expectedStart = 0
        for range in localRanges.sorted(by: { $0.lowerBound < $1.lowerBound }) {
            guard range.lowerBound == expectedStart else { throw HeritgArchiveError.invalidArchive }
            expectedStart = range.upperBound
        }
        guard expectedStart == centralOffset else { throw HeritgArchiveError.invalidArchive }
        return result
    }

    private static func validate(path: String) throws {
        guard !path.isEmpty,
              path.utf8.count <= HeritgArchive.maximumShortFieldBytes,
              !path.hasPrefix("/"), !path.hasSuffix("/"), !path.contains("\\"),
              !path.unicodeScalars.contains(where: { $0.value == 0 }),
              path.split(separator: "/", omittingEmptySubsequences: false).allSatisfy({ $0 != "." && $0 != ".." && !$0.isEmpty }) else {
            throw HeritgArchiveError.invalidArchive
        }
    }

    private static func crc32(_ data: Data) -> UInt32 {
        var crc = UInt32.max
        for byte in data {
            crc = (crc >> 8) ^ crcTable[Int((crc ^ UInt32(byte)) & 0xff)]
        }
        return crc ^ UInt32.max
    }
}

private extension Data {
    mutating func appendZIPUInt16(_ value: UInt16) {
        append(UInt8(truncatingIfNeeded: value))
        append(UInt8(truncatingIfNeeded: value >> 8))
    }

    mutating func appendZIPUInt32(_ value: UInt32) {
        appendZIPUInt16(UInt16(truncatingIfNeeded: value))
        appendZIPUInt16(UInt16(truncatingIfNeeded: value >> 16))
    }

    func zipUInt16(at offset: Int) throws -> UInt16 {
        guard offset >= 0, offset <= count - 2 else { throw HeritgArchiveError.invalidArchive }
        return UInt16(self[offset]) | (UInt16(self[offset + 1]) << 8)
    }

    func zipUInt32(at offset: Int) throws -> UInt32 {
        guard offset >= 0, offset <= count - 4 else { throw HeritgArchiveError.invalidArchive }
        return UInt32(self[offset])
            | (UInt32(self[offset + 1]) << 8)
            | (UInt32(self[offset + 2]) << 16)
            | (UInt32(self[offset + 3]) << 24)
    }

    func zipData(in range: Range<Int>) throws -> Data {
        guard range.lowerBound >= 0, range.upperBound >= range.lowerBound,
              range.upperBound <= count else {
            throw HeritgArchiveError.invalidArchive
        }
        return subdata(in: range)
    }
}
