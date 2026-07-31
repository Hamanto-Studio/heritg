import Foundation

enum GEDCOMExporter {
    static func export(
        people: [Person],
        relationships: [FamilyRelationship]
    ) -> String {
        let peopleByID = Dictionary(uniqueKeysWithValues: people.map { ($0.id, $0) })
        var lines = [
            "0 HEAD",
            "1 GEDC",
            "2 VERS 7.0",
            "1 CHAR UTF-8",
            "1 SOUR Heritg",
            "2 NAME Heritg Family Archive",
            "2 VERS 1.0",
        ]

        for person in people.sorted(by: { $0.createdAt < $1.createdAt }) {
            lines.append(contentsOf: individualLines(
                person,
                relationships: relationships,
                peopleByID: peopleByID
            ))
        }

        var familyIndex = 1
        for relationship in relationships where relationship.kind == .parent {
            guard let parent = peopleByID[relationship.fromPersonID],
                  let child = peopleByID[relationship.toPersonID] else { continue }
            lines.append(contentsOf: familyLines(
                id: familyIndex,
                first: parent,
                second: nil,
                children: [child],
                childSubtype: relationship.subtype,
                marriageDate: nil
            ))
            familyIndex += 1
        }

        var partnerPairs = Set<String>()
        for relationship in relationships where relationship.kind == .partner {
            let pair = [relationship.fromPersonID, relationship.toPersonID].sorted()
            guard partnerPairs.insert(pair.joined(separator: "|")).inserted,
                  let first = peopleByID[pair[0]],
                  let second = peopleByID[pair[1]] else { continue }
            lines.append(contentsOf: familyLines(
                id: familyIndex,
                first: first,
                second: second,
                children: [],
                childSubtype: nil,
                marriageDate: relationship.marriageDate
            ))
            familyIndex += 1
        }

        lines.append("0 TRLR")
        return lines.joined(separator: "\n") + "\n"
    }

    private static func individualLines(
        _ person: Person,
        relationships: [FamilyRelationship],
        peopleByID: [String: Person]
    ) -> [String] {
        var lines = [
            "0 @I\(person.id)@ INDI",
            "1 NAME \(clean(person.displayName))",
            "1 SEX \(sexCode(for: person.gender))",
        ]

        if let birthDate = person.birthDate {
            lines.append("1 BIRT")
            lines.append("2 DATE \(dateString(birthDate))")
        }
        if let deathDate = person.deathDate {
            lines.append("1 DEAT")
            lines.append("2 DATE \(dateString(deathDate))")
        }
        if !person.city.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            lines.append("1 ADDR")
            lines.append("2 CITY \(clean(person.city))")
        }
        appendNote(person.notes, to: &lines)
        for relationship in relationships where relationship.fromPersonID == person.id {
            guard let relative = peopleByID[relationship.toPersonID] else { continue }
            lines.append(contentsOf: associationLines(
                person: person,
                relative: relative,
                relationship: relationship
            ))
        }
        return lines
    }

    private static func familyLines(
        id: Int,
        first: Person,
        second: Person?,
        children: [Person],
        childSubtype: RelationshipSubtype?,
        marriageDate: Date?
    ) -> [String] {
        var lines = ["0 @F\(id)@ FAM"]
        appendFamilyPerson(first, to: &lines)
        if let second { appendFamilyPerson(second, to: &lines) }
        for child in children {
            lines.append("1 CHIL @I\(child.id)@")
            if childSubtype == .adoptiveParent {
                lines.append("2 PEDI adopted")
            } else if childSubtype == .fosterParent {
                lines.append("2 PEDI foster")
            } else if let childSubtype, childSubtype != .biologicalParent {
                lines.append("2 _HERITG_TYPE \(childSubtype.rawValue)")
            }
        }
        if let marriageDate {
            lines.append("1 MARR")
            lines.append("2 DATE \(dateString(marriageDate))")
        }
        return lines
    }

    private static func appendFamilyPerson(_ person: Person, to lines: inout [String]) {
        let tag = person.gender == .female ? "WIFE" : "HUSB"
        lines.append("1 \(tag) @I\(person.id)@")
    }

    private static func associationLines(
        person: Person,
        relative: Person,
        relationship: FamilyRelationship
    ) -> [String] {
        let relation: String
        switch relationship.kind {
        case .parent:
            relation = relationship.subtype.rawValue
        case .partner:
            relation = relationship.subtype.rawValue
        case .sibling:
            relation = relationship.subtype.rawValue
        }
        return ["1 ASSO @I\(relative.id)@", "2 RELA \(relation)"]
    }

    private static func appendNote(_ note: String, to lines: inout [String]) {
        let noteLines = note
            .split(whereSeparator: \.isNewline)
            .map { clean(String($0)) }
            .filter { !$0.isEmpty }
        guard let first = noteLines.first else { return }
        lines.append("1 NOTE \(first)")
        for line in noteLines.dropFirst() { lines.append("2 CONT \(line)") }
    }

    private static func sexCode(for gender: PersonGender) -> String {
        switch gender {
        case .male: "M"
        case .female: "F"
        case .unspecified: "U"
        }
    }

    private static func dateString(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "d MMM yyyy"
        return formatter.string(from: date).uppercased()
    }

    private static func clean(_ value: String) -> String {
        value
            .replacingOccurrences(of: "\n", with: " ")
            .replacingOccurrences(of: "\r", with: " ")
            .replacingOccurrences(of: "/", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
