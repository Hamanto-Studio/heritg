import Foundation
import SwiftData
import Testing
@testable import HERITG

struct LifeDatesTests {
    @Test func formatsLivingAndDeceasedNames() {
        let living = Person(displayName: "Rina")
        living.birthDate = Calendar.current.date(byAdding: .year, value: -43, to: .now)
        #expect(living.displayNameWithAge == "Rina (43)")

        let deceased = Person(displayName: "Sukarno")
        deceased.birthDate = date(1943, 6, 1)
        deceased.deathDate = date(2001, 5, 31)

        #expect(deceased.age == 57)
        #expect(deceased.displayNameWithAge == "Sukarno (57) (1943-2001)")

        let yearFormatting = Person(displayName: "Year Formatting")
        yearFormatting.birthDate = date(1996, 1, 1)
        yearFormatting.deathDate = date(2021, 1, 1)
        #expect(yearFormatting.lifeSummary?.contains("1996-2021") == true)
        #expect(yearFormatting.lifeSummary?.contains(",") == false)

        let noBirthday = Person(displayName: "Unknown")
        noBirthday.deathDate = date(2001, 1, 1)
        #expect(noBirthday.displayNameWithAge == "Unknown")
    }

    @MainActor
    @Test func rejectsDeathBeforeBirth() throws {
        let context = try makeContext()
        let tree = try FamilyGraph.createTree(named: "Rina Family", in: context)
        let person = try FamilyGraph.createPerson(named: "Rina", in: tree, context: context)
        var details = PersonDetails.empty
        details.birthDate = date(2000, 1, 1)
        details.deathDate = date(1999, 12, 31)

        #expect(throws: FamilyGraphError.deathBeforeBirth) {
            try FamilyGraph.update(
                person,
                name: person.displayName,
                gender: person.gender,
                details: details,
                in: context
            )
        }
    }

    @MainActor
    @Test func persistsMarriageDateAndExportsLifeEvents() throws {
        let context = try makeContext()
        let tree = try FamilyGraph.createTree(named: "Rina Family", in: context)
        let first = try FamilyGraph.createPerson(named: "Rina", in: tree, context: context)
        let second = try FamilyGraph.createPerson(named: "Ari", in: tree, context: context)
        var details = PersonDetails.empty
        details.birthDate = date(1943, 6, 1)
        details.deathDate = date(2001, 5, 31)
        let marriageDate = date(1970, 8, 17)

        try FamilyGraph.update(
            first,
            name: first.displayName,
            gender: .female,
            details: details,
            deleting: [],
            linking: [(second, .partner, marriageDate)],
            relationships: [],
            in: context
        )

        let relationships = try context.fetch(FetchDescriptor<FamilyRelationship>())
        #expect(relationships.first?.marriageDate == marriageDate)

        let gedcom = GEDCOMExporter.export(people: [first, second], relationships: relationships)
        #expect(gedcom.contains("1 DEAT\n2 DATE 31 MAY 2001"))
        #expect(gedcom.contains("1 MARR\n2 DATE 17 AUG 1970"))
    }

    @MainActor
    @Test func addRelativePersistsExactBirthAndMarriageDates() throws {
        let context = try makeContext()
        let tree = try FamilyGraph.createTree(named: "Rina Family", in: context)
        let person = try FamilyGraph.createPerson(named: "Rina", in: tree, context: context)
        let birthDate = date(1990, 4, 23)
        let marriageDate = date(2015, 9, 12)
        var details = PersonDetails.empty
        details.birthDate = birthDate

        let spouse = try FamilyGraph.addRelative(
            named: "Ari",
            to: person,
            as: .wife,
            details: details,
            marriageDate: marriageDate,
            in: context
        )
        let relationships = try context.fetch(FetchDescriptor<FamilyRelationship>())

        #expect(spouse.birthDate == birthDate)
        #expect(spouse.birthDatePrecision == .exact)
        #expect(relationships.first?.marriageDate == marriageDate)
    }

    @Test func loadsIndonesianTranslationsAndPluralRules() throws {
        let appBundle = Bundle(identifier: "tech.robihamanto.heritg.ios") ?? .main
        let localizationURL = try #require(appBundle.url(forResource: "id", withExtension: "lproj"))
        let bundle = try #require(Bundle(url: localizationURL))

        #expect(bundle.localizedString(forKey: "Settings", value: nil, table: nil) == "Pengaturan")
        #expect(bundle.localizedString(forKey: "Grandfather", value: nil, table: nil) == "Kakek")

        let peopleFormat = bundle.localizedString(forKey: "%lld people", value: nil, table: nil)
        #expect(String.localizedStringWithFormat(peopleFormat, 3) == "3 orang")

        let warningsFormat = bundle.localizedString(forKey: "%lld warnings", value: nil, table: nil)
        #expect(String.localizedStringWithFormat(warningsFormat, 1) == "1 peringatan")
    }

    @Test func loadsAccurateIndonesianKinshipTerms() throws {
        let appBundle = Bundle(identifier: "tech.robihamanto.heritg.ios") ?? .main
        let localizationURL = try #require(appBundle.url(forResource: "id", withExtension: "lproj"))
        let bundle = try #require(Bundle(url: localizationURL))
        let expectedTerms = [
            "You": "Anda",
            "Family member": "Anggota keluarga",
            "Parent": "Orang tua",
            "Father": "Ayah",
            "Mother": "Ibu",
            "Child": "Anak",
            "Son": "Anak laki-laki",
            "Daughter": "Anak perempuan",
            "Sibling": "Saudara kandung",
            "Brother": "Saudara laki-laki",
            "Sister": "Saudara perempuan",
            "Grandparent": "Kakek/Nenek",
            "Grandfather": "Kakek",
            "Grandmother": "Nenek",
            "Grandchild": "Cucu",
            "Grandson": "Cucu laki-laki",
            "Granddaughter": "Cucu perempuan",
            "Aunt/Uncle": "Bibi/Paman",
            "Uncle": "Paman",
            "Aunt": "Bibi",
            "Niece/Nephew": "Keponakan",
            "Nephew": "Keponakan laki-laki",
            "Niece": "Keponakan perempuan",
            "Cousin": "Sepupu",
            "First cousin": "Sepupu dekat",
            "Second cousin": "Sepupu dua kali",
            "Third cousin": "Sepupu tiga kali",
            "Partner": "Pasangan",
            "Spouse": "Suami/istri",
            "Husband": "Suami",
            "Wife": "Istri",
            "Former partner": "Mantan pasangan",
            "Former spouse": "Mantan suami/istri",
            "Former husband": "Mantan suami",
            "Former wife": "Mantan istri",
            "Parent-in-law": "Mertua",
            "Father-in-law": "Ayah mertua",
            "Mother-in-law": "Ibu mertua",
            "Child-in-law": "Menantu",
            "Son-in-law": "Menantu laki-laki",
            "Daughter-in-law": "Menantu perempuan",
            "Sibling-in-law": "Ipar",
            "Brother-in-law": "Ipar laki-laki",
            "Sister-in-law": "Ipar perempuan",
            "Step-parent": "Orang tua tiri",
            "Stepfather": "Ayah tiri",
            "Stepmother": "Ibu tiri",
            "Stepchild": "Anak tiri",
            "Stepson": "Anak tiri laki-laki",
            "Stepdaughter": "Anak tiri perempuan",
            "Stepsibling": "Saudara tiri",
            "Stepbrother": "Saudara tiri laki-laki",
            "Stepsister": "Saudara tiri perempuan",
            "Half-sibling": "Saudara seayah atau seibu",
            "Half-brother": "Saudara laki-laki seayah atau seibu",
            "Half-sister": "Saudara perempuan seayah atau seibu",
            "Adoptive parent": "Orang tua angkat",
            "Adoptive father": "Ayah angkat",
            "Adoptive mother": "Ibu angkat",
            "Adoptive child": "Anak angkat",
            "Adoptive son": "Anak angkat laki-laki",
            "Adoptive daughter": "Anak angkat perempuan",
            "Adoptive sibling": "Saudara angkat",
            "Adoptive brother": "Saudara angkat laki-laki",
            "Adoptive sister": "Saudara angkat perempuan",
            "Foster parent": "Orang tua asuh",
            "Foster father": "Ayah asuh",
            "Foster mother": "Ibu asuh",
            "Foster child": "Anak asuh",
            "Foster son": "Anak asuh laki-laki",
            "Foster daughter": "Anak asuh perempuan",
            "Foster sibling": "Saudara asuh",
            "Foster brother": "Saudara asuh laki-laki",
            "Foster sister": "Saudara asuh perempuan",
            "Guardian": "Wali",
            "Ward": "Anak di bawah perwalian",
        ]

        for (key, expected) in expectedTerms {
            #expect(bundle.localizedString(forKey: key, value: nil, table: nil) == expected)
        }

        let cousinFormat = bundle.localizedString(forKey: "%lldth cousin", value: nil, table: nil)
        #expect(String.localizedStringWithFormat(cousinFormat, 4) == "Sepupu 4 kali")
    }

    private func date(_ year: Int, _ month: Int, _ day: Int) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar.date(from: DateComponents(year: year, month: month, day: day))!
    }

    @MainActor
    private func makeContext() throws -> ModelContext {
        let schema = Schema([FamilyTree.self, Person.self, FamilyRelationship.self])
        let configuration = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        let container = try ModelContainer(for: schema, configurations: [configuration])
        return ModelContext(container)
    }
}
