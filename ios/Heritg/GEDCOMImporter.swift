import Foundation

struct GEDCOMImport {
    let suggestedTitle: String
    let people: [GEDCOMImportedPerson]
    let relationships: [GEDCOMImportedRelationship]
    let warnings: [String]
}

struct GEDCOMImportedPerson {
    let sourceID: String
    var name: String
    var gender: PersonGender = .unspecified
    var birthDate: Date?
    var deathDate: Date?
    var birthDatePrecision: BirthDatePrecision = .exact
    var city = ""
    var notes = ""
}

struct GEDCOMImportedRelationship {
    let fromSourceID: String
    let toSourceID: String
    let kind: RelationshipKind
    var subtype: RelationshipSubtype?
    var marriageDate: Date?
}

enum GEDCOMImportError: LocalizedError {
    case emptyFile
    case fileTooLarge
    case malformedLine(Int)
    case tooManyRecords
    case noPeople

    var errorDescription: String? {
        switch self {
        case .emptyFile: String(localized: "The GEDCOM file is empty.", locale: AppLanguage.selectedLocale)
        case .fileTooLarge: String(localized: "The GEDCOM file is larger than 25 MB.", locale: AppLanguage.selectedLocale)
        case .malformedLine(let line): String(localized: "The GEDCOM file is invalid near line \(line).", locale: AppLanguage.selectedLocale)
        case .tooManyRecords: String(localized: "The GEDCOM file contains too many records.", locale: AppLanguage.selectedLocale)
        case .noPeople: String(localized: "The GEDCOM file does not contain any people.", locale: AppLanguage.selectedLocale)
        }
    }
}

enum GEDCOMImporter {
    static let maximumBytes = 25 * 1_024 * 1_024
    private static let maximumRecords = 50_000

    static func parse(data: Data, sourceName: String) throws -> GEDCOMImport {
        guard !data.isEmpty else { throw GEDCOMImportError.emptyFile }
        guard data.count <= maximumBytes else { throw GEDCOMImportError.fileTooLarge }
        guard let text = String(data: data, encoding: .utf8)
                ?? String(data: data, encoding: .isoLatin1) else {
            throw GEDCOMImportError.emptyFile
        }

        var people = [String: GEDCOMImportedPerson]()
        var personOrder = [String]()
        var families = [ImportedFamily]()
        var currentPersonID: String?
        var currentFamily: ImportedFamily?
        var currentEvent: Event?
        var currentNotePersonID: String?
        var warnings = [String]()
        var familyReferenceCount = 0

        let lines = text.split(whereSeparator: \.isNewline)
        for (offset, rawLine) in lines.enumerated() {
            guard rawLine.utf8.count <= 65_536 else {
                throw GEDCOMImportError.malformedLine(offset + 1)
            }
            let components = rawLine.split(
                separator: " ",
                maxSplits: 2,
                omittingEmptySubsequences: true
            )
            guard components.count >= 2, let level = Int(components[0]) else {
                throw GEDCOMImportError.malformedLine(offset + 1)
            }

            if level == 0 {
                if let currentFamily { families.append(currentFamily) }
                currentFamily = nil
                currentPersonID = nil
                currentEvent = nil
                currentNotePersonID = nil

                guard components.count == 3 else { continue }
                let identifier = String(components[1]).trimmingCharacters(in: CharacterSet(charactersIn: "@"))
                let recordType = String(components[2]).uppercased()
                if recordType == "INDI" {
                    guard people[identifier] == nil else {
                        warnings.append(String(
                            localized: "Duplicate person record @\(identifier)@ was ignored.",
                            locale: AppLanguage.selectedLocale
                        ))
                        continue
                    }
                    people[identifier] = GEDCOMImportedPerson(
                        sourceID: identifier,
                        name: String(localized: "Unnamed person", locale: AppLanguage.selectedLocale)
                    )
                    personOrder.append(identifier)
                    currentPersonID = identifier
                } else if recordType == "FAM" {
                    currentFamily = ImportedFamily()
                }
                guard people.count + families.count <= maximumRecords else {
                    throw GEDCOMImportError.tooManyRecords
                }
                continue
            }

            let tag = String(components[1]).uppercased()
            let value = components.count == 3 ? String(components[2]) : ""

            if let personID = currentPersonID, var person = people[personID] {
                if level == 1 {
                    currentEvent = nil
                    currentNotePersonID = nil
                }
                switch (level, tag) {
                case (1, "NAME"):
                    person.name = cleanName(value)
                case (1, "SEX"):
                    person.gender = gender(value)
                case (1, "BIRT"):
                    currentEvent = .birth
                case (1, "DEAT"):
                    currentEvent = .death
                case (1, "NOTE"):
                    person.notes = value
                    currentNotePersonID = personID
                case (1, "ADDR"):
                    currentEvent = .address
                case (2, "DATE"):
                    if let parsed = parseDate(value) {
                        if currentEvent == .birth {
                            person.birthDate = parsed.date
                            person.birthDatePrecision = parsed.precision
                        } else if currentEvent == .death {
                            person.deathDate = parsed.date
                        }
                    } else {
                        warnings.append(String(
                            localized: "A date for \(person.name) could not be imported: \(value)",
                            locale: AppLanguage.selectedLocale
                        ))
                    }
                case (2, "CITY") where currentEvent == .address:
                    person.city = value.trimmingCharacters(in: .whitespacesAndNewlines)
                case (2, "PLAC"):
                    warnings.append(String(
                        localized: "A place for \(person.name) was not imported because event places are not supported yet.",
                        locale: AppLanguage.selectedLocale
                    ))
                case (2, "CONT") where currentNotePersonID == personID:
                    person.notes += person.notes.isEmpty ? value : "\n\(value)"
                default:
                    break
                }
                people[personID] = person
            } else if currentFamily != nil {
                if level == 1 { currentEvent = nil }
                switch (level, tag) {
                case (1, "HUSB"), (1, "WIFE"):
                    let personID = referenceID(value)
                    if currentFamily?.parents.contains(personID) == false,
                       (currentFamily?.parents.count ?? 0) < 2 {
                        currentFamily?.parents.append(personID)
                        familyReferenceCount += 1
                    }
                case (1, "CHIL"):
                    let personID = referenceID(value)
                    if currentFamily?.children.contains(where: { $0.personID == personID }) == false {
                        currentFamily?.children.append(ImportedChild(personID: personID))
                        familyReferenceCount += 1
                    }
                case (2, "PEDI"):
                    if let index = currentFamily?.children.indices.last,
                       value.uppercased() == "ADOPTED" {
                        currentFamily?.children[index].subtype = .adoptiveParent
                    } else if let index = currentFamily?.children.indices.last,
                              value.uppercased() == "FOSTER" {
                        currentFamily?.children[index].subtype = .fosterParent
                    }
                case (2, "_HERITG_TYPE"):
                    if let index = currentFamily?.children.indices.last,
                       let subtype = RelationshipSubtype(rawValue: value) {
                        currentFamily?.children[index].subtype = subtype
                    }
                case (1, "MARR"):
                    currentEvent = .marriage
                case (2, "DATE") where currentEvent == .marriage:
                    currentFamily?.marriageDate = parseDate(value)?.date
                default:
                    break
                }
                guard familyReferenceCount <= maximumRecords else {
                    throw GEDCOMImportError.tooManyRecords
                }
            }
        }
        if let currentFamily { families.append(currentFamily) }

        let importedPeople = personOrder.compactMap { people[$0] }
        guard !importedPeople.isEmpty else { throw GEDCOMImportError.noPeople }
        let relationships = try makeRelationships(families: families, validIDs: Set(personOrder))
        let sourceTitle = URL(fileURLWithPath: sourceName).deletingPathExtension().lastPathComponent
        return GEDCOMImport(
            suggestedTitle: sourceTitle.isEmpty
                ? String(localized: "Imported Family Tree", locale: AppLanguage.selectedLocale)
                : sourceTitle,
            people: importedPeople,
            relationships: relationships,
            warnings: warnings
        )
    }

    private static func makeRelationships(
        families: [ImportedFamily],
        validIDs: Set<String>
    ) throws -> [GEDCOMImportedRelationship] {
        var signatures = Set<String>()
        var result = [GEDCOMImportedRelationship]()
        for family in families {
            let parents = family.parents.filter(validIDs.contains)
            let children = family.children.filter { validIDs.contains($0.personID) }
            if parents.count >= 2 {
                let pair = Array(parents.prefix(2)).sorted()
                appendRelationship(
                    from: pair[0],
                    to: pair[1],
                    kind: .partner,
                    subtype: family.marriageDate == nil ? .partner : .spouse,
                    marriageDate: family.marriageDate,
                    signatures: &signatures,
                    result: &result
                )
            }
            for parent in parents {
                for child in children where parent != child.personID {
                    appendRelationship(
                        from: parent,
                        to: child.personID,
                        kind: .parent,
                        subtype: child.subtype,
                        marriageDate: nil,
                        signatures: &signatures,
                        result: &result
                    )
                    guard result.count <= maximumRecords else {
                        throw GEDCOMImportError.tooManyRecords
                    }
                }
            }
        }
        return result
    }

    private static func appendRelationship(
        from: String,
        to: String,
        kind: RelationshipKind,
        subtype: RelationshipSubtype? = nil,
        marriageDate: Date?,
        signatures: inout Set<String>,
        result: inout [GEDCOMImportedRelationship]
    ) {
        let signature = "\(kind.rawValue)|\(from)|\(to)"
        guard signatures.insert(signature).inserted else { return }
        result.append(GEDCOMImportedRelationship(
            fromSourceID: from,
            toSourceID: to,
            kind: kind,
            subtype: subtype,
            marriageDate: marriageDate
        ))
    }

    private static func parseDate(_ value: String) -> (date: Date, precision: BirthDatePrecision)? {
        var normalized = value.uppercased().trimmingCharacters(in: .whitespacesAndNewlines)
        for prefix in ["ABT ", "BEF ", "AFT ", "CAL ", "EST "] where normalized.hasPrefix(prefix) {
            normalized.removeFirst(prefix.count)
        }
        let formats: [(String, BirthDatePrecision)] = [
            ("d MMM yyyy", .exact),
            ("MMM yyyy", .month),
            ("yyyy", .year),
        ]
        for (format, precision) in formats {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = TimeZone(secondsFromGMT: 0)
            formatter.dateFormat = format
            if let date = formatter.date(from: normalized) { return (date, precision) }
        }
        return nil
    }

    private static func cleanName(_ value: String) -> String {
        value.replacingOccurrences(of: "/", with: " ")
            .split(whereSeparator: \.isWhitespace)
            .joined(separator: " ")
    }

    private static func referenceID(_ value: String) -> String {
        value.trimmingCharacters(in: CharacterSet(charactersIn: "@ "))
    }

    private static func gender(_ value: String) -> PersonGender {
        switch value.uppercased() {
        case "M": .male
        case "F": .female
        default: .unspecified
        }
    }

    private enum Event { case birth, death, marriage, address }

    private struct ImportedFamily {
        var parents = [String]()
        var children = [ImportedChild]()
        var marriageDate: Date?
    }

    private struct ImportedChild {
        let personID: String
        var subtype: RelationshipSubtype? = nil
    }
}
