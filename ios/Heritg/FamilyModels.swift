import Foundation
import SwiftData

enum RelationshipKind: String, Codable {
    case parent
    case partner
    case sibling
}

enum RelationshipSubtype: String, Codable {
    case biologicalParent
    case adoptiveParent
    case fosterParent
    case guardian
    case stepParent
    case partner
    case spouse
    case formerPartner
    case formerSpouse
    case sibling
    case halfSibling
    case adoptiveSibling
    case fosterSibling
    case stepSibling

    static func legacyDefault(for kind: RelationshipKind) -> RelationshipSubtype {
        switch kind {
        case .parent: .biologicalParent
        case .partner: .partner
        case .sibling: .sibling
        }
    }

    var contributesToAncestry: Bool {
        self == .biologicalParent || self == .adoptiveParent
    }

    var isActiveUnion: Bool {
        self == .partner || self == .spouse
    }
}

@Model
final class FamilyTree {
    var id: String = ""
    var title: String = ""
    var createdAt: Date = Date.now
    var updatedAt: Date = Date.now
    var lastSelectedPersonID: String?

    init(
        id: String = UUID().uuidString.lowercased(),
        title: String,
        createdAt: Date = .now,
        updatedAt: Date = .now,
        lastSelectedPersonID: String? = nil
    ) {
        self.id = id
        self.title = title
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.lastSelectedPersonID = lastSelectedPersonID
    }
}

extension FamilyTree {
    func resolvedFocusID(in people: [Person]) -> String? {
        let treePeople = people.filter { $0.treeID == id }
        if let lastSelectedPersonID,
           treePeople.contains(where: { $0.id == lastSelectedPersonID }) {
            return lastSelectedPersonID
        }
        return treePeople.first?.id
    }
}

enum PersonGender: String, CaseIterable, Codable, Identifiable {
    case unspecified
    case female
    case male

    var id: String { rawValue }

    var title: String {
        switch self {
        case .unspecified: AppLanguage.localized("Not specified")
        case .female: AppLanguage.localized("Female")
        case .male: AppLanguage.localized("Male")
        }
    }
}

enum BirthDatePrecision: String, CaseIterable, Codable, Identifiable {
    case exact
    case month
    case year

    var id: String { rawValue }

    var title: String {
        switch self {
        case .exact: AppLanguage.localized("Exact date")
        case .month: AppLanguage.localized("Month and year")
        case .year: AppLanguage.localized("Year only")
        }
    }
}

struct PersonDetails {
    var birthDate: Date?
    var deathDate: Date?
    var birthDatePrecision: BirthDatePrecision
    var notes: String
    var addressLine: String
    var city: String
    var province: String
    var country: String
    var postalCode: String
    var profilePhotoData: Data? = nil

    nonisolated static let empty = PersonDetails(
        birthDate: nil,
        deathDate: nil,
        birthDatePrecision: .exact,
        notes: "",
        addressLine: "",
        city: "",
        province: "",
        country: "",
        postalCode: ""
    )
}

enum RelativeRole: String, CaseIterable, Identifiable {
    case father
    case mother
    case brother
    case sister
    case partner
    case son
    case daughter
    case adoptiveFather
    case adoptiveMother
    case fosterFather
    case fosterMother
    case guardian
    case stepfather
    case stepmother
    case halfBrother
    case halfSister
    case adoptiveBrother
    case adoptiveSister
    case fosterBrother
    case fosterSister
    case stepbrother
    case stepsister
    case husband
    case wife
    case formerPartner
    case formerHusband
    case formerWife
    case adoptiveSon
    case adoptiveDaughter
    case fosterSon
    case fosterDaughter
    case ward
    case stepson
    case stepdaughter

    var id: String { rawValue }

    var title: String {
        switch self {
        case .father: AppLanguage.localized("Father")
        case .mother: AppLanguage.localized("Mother")
        case .adoptiveFather: AppLanguage.localized("Adoptive father")
        case .adoptiveMother: AppLanguage.localized("Adoptive mother")
        case .fosterFather: AppLanguage.localized("Foster father")
        case .fosterMother: AppLanguage.localized("Foster mother")
        case .guardian: AppLanguage.localized("Guardian")
        case .stepfather: AppLanguage.localized("Stepfather")
        case .stepmother: AppLanguage.localized("Stepmother")
        case .brother: AppLanguage.localized("Brother")
        case .sister: AppLanguage.localized("Sister")
        case .halfBrother: AppLanguage.localized("Half-brother")
        case .halfSister: AppLanguage.localized("Half-sister")
        case .adoptiveBrother: AppLanguage.localized("Adoptive brother")
        case .adoptiveSister: AppLanguage.localized("Adoptive sister")
        case .fosterBrother: AppLanguage.localized("Foster brother")
        case .fosterSister: AppLanguage.localized("Foster sister")
        case .stepbrother: AppLanguage.localized("Stepbrother")
        case .stepsister: AppLanguage.localized("Stepsister")
        case .partner: AppLanguage.localized("Partner")
        case .husband: AppLanguage.localized("Husband")
        case .wife: AppLanguage.localized("Wife")
        case .formerPartner: AppLanguage.localized("Former partner")
        case .formerHusband: AppLanguage.localized("Former husband")
        case .formerWife: AppLanguage.localized("Former wife")
        case .son: AppLanguage.localized("Son")
        case .daughter: AppLanguage.localized("Daughter")
        case .adoptiveSon: AppLanguage.localized("Adoptive son")
        case .adoptiveDaughter: AppLanguage.localized("Adoptive daughter")
        case .fosterSon: AppLanguage.localized("Foster son")
        case .fosterDaughter: AppLanguage.localized("Foster daughter")
        case .ward: AppLanguage.localized("Ward")
        case .stepson: AppLanguage.localized("Stepson")
        case .stepdaughter: AppLanguage.localized("Stepdaughter")
        }
    }

    var systemImage: String {
        switch self {
        case .father, .mother, .adoptiveFather, .adoptiveMother, .fosterFather,
             .fosterMother, .guardian, .stepfather, .stepmother: "arrow.up"
        case .brother, .sister, .halfBrother, .halfSister, .adoptiveBrother,
             .adoptiveSister, .fosterBrother, .fosterSister, .stepbrother, .stepsister:
            "arrow.left.and.right"
        case .partner, .husband, .wife, .formerPartner, .formerHusband, .formerWife: "heart"
        case .son, .daughter, .adoptiveSon, .adoptiveDaughter, .fosterSon,
             .fosterDaughter, .ward, .stepson, .stepdaughter: "arrow.down"
        }
    }

    var gender: PersonGender {
        switch self {
        case .father, .adoptiveFather, .fosterFather, .stepfather, .brother, .halfBrother,
             .adoptiveBrother, .fosterBrother, .stepbrother, .husband, .formerHusband,
             .son, .adoptiveSon, .fosterSon, .stepson: .male
        case .mother, .adoptiveMother, .fosterMother, .stepmother, .sister, .halfSister,
             .adoptiveSister, .fosterSister, .stepsister, .wife, .formerWife, .daughter,
             .adoptiveDaughter, .fosterDaughter, .stepdaughter: .female
        case .guardian, .partner, .formerPartner, .ward: .unspecified
        }
    }

    var kind: RelationshipKind {
        switch self {
        case .father, .mother, .adoptiveFather, .adoptiveMother, .fosterFather,
             .fosterMother, .guardian, .stepfather, .stepmother, .son, .daughter,
             .adoptiveSon, .adoptiveDaughter, .fosterSon, .fosterDaughter, .ward,
             .stepson, .stepdaughter: .parent
        case .partner, .husband, .wife, .formerPartner, .formerHusband, .formerWife: .partner
        default: .sibling
        }
    }

    var subtype: RelationshipSubtype {
        switch self {
        case .father, .mother, .son, .daughter: .biologicalParent
        case .adoptiveFather, .adoptiveMother, .adoptiveSon, .adoptiveDaughter: .adoptiveParent
        case .fosterFather, .fosterMother, .fosterSon, .fosterDaughter: .fosterParent
        case .guardian, .ward: .guardian
        case .stepfather, .stepmother, .stepson, .stepdaughter: .stepParent
        case .partner: .partner
        case .husband, .wife: .spouse
        case .formerPartner: .formerPartner
        case .formerHusband, .formerWife: .formerSpouse
        case .brother, .sister: .sibling
        case .halfBrother, .halfSister: .halfSibling
        case .adoptiveBrother, .adoptiveSister: .adoptiveSibling
        case .fosterBrother, .fosterSister: .fosterSibling
        case .stepbrother, .stepsister: .stepSibling
        }
    }

    var relativeIsParent: Bool {
        switch self {
        case .father, .mother, .adoptiveFather, .adoptiveMother, .fosterFather,
             .fosterMother, .guardian, .stepfather, .stepmother: true
        default: false
        }
    }

    var relativeIsChild: Bool {
        kind == .parent && !relativeIsParent
    }

    var allowsCoParent: Bool {
        relativeIsChild && subtype != .stepParent
    }
}

@Model
final class Person {
    var id: String = ""
    var treeID: String = ""
    var displayName: String = ""
    var genderRaw: String = PersonGender.unspecified.rawValue
    var createdAt: Date = Date.now
    var birthDate: Date?
    var deathDate: Date?
    var birthDatePrecisionRaw: String = BirthDatePrecision.exact.rawValue
    var notes: String = ""
    var addressLine: String = ""
    var city: String = ""
    var province: String = ""
    var country: String = ""
    var postalCode: String = ""
    @Attribute(.externalStorage) var profilePhotoData: Data? = nil

    var gender: PersonGender {
        get { PersonGender(rawValue: genderRaw) ?? .unspecified }
        set { genderRaw = newValue.rawValue }
    }

    var birthDatePrecision: BirthDatePrecision {
        get { BirthDatePrecision(rawValue: birthDatePrecisionRaw) ?? .exact }
        set { birthDatePrecisionRaw = newValue.rawValue }
    }

    var age: Int? {
        guard let birthDate else { return nil }
        return Calendar.current.dateComponents(
            [.year],
            from: birthDate,
            to: deathDate ?? .now
        ).year
    }

    var displayNameWithAge: String {
        guard let birthDate, let age else { return displayName }
        if let deathDate {
            let calendar = Calendar.current
            let birthYear = String(calendar.component(.year, from: birthDate))
            let deathYear = String(calendar.component(.year, from: deathDate))
            return String(
                localized: "\(displayName) (\(age)) (\(birthYear)-\(deathYear))",
                bundle: AppLanguage.selectedBundle,
                locale: AppLanguage.selectedLocale,
                comment: "Person name, age, birth year, and death year."
            )
        }
        return String(
            localized: "\(displayName) (\(age))",
            bundle: AppLanguage.selectedBundle,
            locale: AppLanguage.selectedLocale,
            comment: "Person name followed by their age."
        )
    }

    var lifeSummary: String? {
        guard let birthDate else { return nil }
        let calendar = Calendar.current
        let birthYear = String(calendar.component(.year, from: birthDate))
        guard let deathDate else {
            guard let age else {
                return String(
                    localized: "Born \(birthYear)",
                    bundle: AppLanguage.selectedBundle,
                    locale: AppLanguage.selectedLocale
                )
            }
            return String(
                localized: "Born \(birthYear) · age \(age)",
                bundle: AppLanguage.selectedBundle,
                locale: AppLanguage.selectedLocale
            )
        }
        let deathYear = String(calendar.component(.year, from: deathDate))
        guard let age else {
            return String(
                localized: "\(birthYear)-\(deathYear)",
                bundle: AppLanguage.selectedBundle,
                locale: AppLanguage.selectedLocale
            )
        }
        return String(
            localized: "\(birthYear)-\(deathYear) · age \(age)",
            bundle: AppLanguage.selectedBundle,
            locale: AppLanguage.selectedLocale
        )
    }

    init(
        id: String = UUID().uuidString.lowercased(),
        treeID: String = "",
        displayName: String,
        gender: PersonGender = .unspecified,
        createdAt: Date = .now
    ) {
        self.id = id
        self.treeID = treeID
        self.displayName = displayName
        self.genderRaw = gender.rawValue
        self.createdAt = createdAt
    }
}

enum FamilyRoleLabel {
    static func label(
        relativeGender: PersonGender,
        relationshipKind: RelationshipKind,
        focusedPersonID: String,
        fromPersonID: String,
        toPersonID: String,
        relationshipSubtype: RelationshipSubtype? = nil
    ) -> String {
        let subtype = relationshipSubtype ?? .legacyDefault(for: relationshipKind)
        if relationshipKind == .parent {
            let relativeIsParent = toPersonID == focusedPersonID
            return parentLabel(gender: relativeGender, subtype: subtype, isParent: relativeIsParent)
        }
        if relationshipKind == .partner {
            switch subtype {
            case .spouse:
                return gendered(relativeGender, male: "Husband", female: "Wife", neutral: "Spouse")
            case .formerSpouse:
                return gendered(relativeGender, male: "Former husband", female: "Former wife", neutral: "Former spouse")
            case .formerPartner: return AppLanguage.localized("Former partner")
            default: return AppLanguage.localized("Partner")
            }
        }
        if relationshipKind == .sibling {
            return siblingLabel(gender: relativeGender, subtype: subtype)
        }
        switch relationshipKind {
        case .parent, .partner, .sibling:
            return AppLanguage.localized("Family member")
        }
    }

    private static func parentLabel(
        gender: PersonGender,
        subtype: RelationshipSubtype,
        isParent: Bool
    ) -> String {
        switch (subtype, isParent) {
        case (.adoptiveParent, true): return gendered(gender, male: "Adoptive father", female: "Adoptive mother", neutral: "Adoptive parent")
        case (.adoptiveParent, false): return gendered(gender, male: "Adoptive son", female: "Adoptive daughter", neutral: "Adoptive child")
        case (.fosterParent, true): return gendered(gender, male: "Foster father", female: "Foster mother", neutral: "Foster parent")
        case (.fosterParent, false): return gendered(gender, male: "Foster son", female: "Foster daughter", neutral: "Foster child")
        case (.guardian, true): return AppLanguage.localized("Guardian")
        case (.guardian, false): return AppLanguage.localized("Ward")
        case (.stepParent, true): return gendered(gender, male: "Stepfather", female: "Stepmother", neutral: "Step-parent")
        case (.stepParent, false): return gendered(gender, male: "Stepson", female: "Stepdaughter", neutral: "Stepchild")
        default:
            return isParent
                ? gendered(gender, male: "Father", female: "Mother", neutral: "Parent")
                : gendered(gender, male: "Son", female: "Daughter", neutral: "Child")
        }
    }

    private static func siblingLabel(gender: PersonGender, subtype: RelationshipSubtype) -> String {
        switch subtype {
        case .halfSibling: gendered(gender, male: "Half-brother", female: "Half-sister", neutral: "Half-sibling")
        case .adoptiveSibling: gendered(gender, male: "Adoptive brother", female: "Adoptive sister", neutral: "Adoptive sibling")
        case .fosterSibling: gendered(gender, male: "Foster brother", female: "Foster sister", neutral: "Foster sibling")
        case .stepSibling: gendered(gender, male: "Stepbrother", female: "Stepsister", neutral: "Stepsibling")
        default: gendered(gender, male: "Brother", female: "Sister", neutral: "Sibling")
        }
    }

    private static func gendered(
        _ gender: PersonGender,
        male: String.LocalizationValue,
        female: String.LocalizationValue,
        neutral: String.LocalizationValue
    ) -> String {
        switch gender {
        case .male: AppLanguage.localized(male)
        case .female: AppLanguage.localized(female)
        case .unspecified: AppLanguage.localized(neutral)
        }
    }
}

@Model
final class FamilyRelationship {
    var id: String = ""
    var treeID: String = ""
    var fromPersonID: String = ""
    var toPersonID: String = ""
    var kindRaw: String = RelationshipKind.parent.rawValue
    var subtypeRaw: String = ""
    var createdAt: Date = Date.now
    var marriageDate: Date?

    var kind: RelationshipKind {
        get { RelationshipKind(rawValue: kindRaw) ?? .parent }
        set { kindRaw = newValue.rawValue }
    }

    var subtype: RelationshipSubtype {
        get { RelationshipSubtype(rawValue: subtypeRaw) ?? .legacyDefault(for: kind) }
        set { subtypeRaw = newValue.rawValue }
    }

    var marriageYear: String? {
        guard kind == .partner, let marriageDate else { return nil }
        return String(Calendar.current.component(.year, from: marriageDate))
    }

    init(
        id: String = UUID().uuidString.lowercased(),
        treeID: String = "",
        fromPersonID: String,
        toPersonID: String,
        kind: RelationshipKind,
        subtype: RelationshipSubtype? = nil,
        marriageDate: Date? = nil,
        createdAt: Date = .now
    ) {
        self.id = id
        self.treeID = treeID
        self.fromPersonID = fromPersonID
        self.toPersonID = toPersonID
        self.kindRaw = kind.rawValue
        self.subtypeRaw = (subtype ?? .legacyDefault(for: kind)).rawValue
        self.marriageDate = marriageDate
        self.createdAt = createdAt
    }
}
