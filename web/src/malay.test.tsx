import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createInitialAppData, createPerson, replaceAppData, setLanguage, setRelationshipLanguage } from "./domain";
import { createTranslator, formatDisplayDate, messageCatalogs } from "./i18n";
import { browserAppLanguage, localeForLanguage } from "./locale";
import { applyUiLanguage, readUiLanguage, saveUiLanguage } from "./uiLanguage";
import { deriveKinshipLabels, directRelationshipLabel, relationshipLanguageForData } from "./kinship";
import { malayKinshipLabel } from "./kinship.ms";
import { personLifeSummary } from "./lifeSummary";
import { birthOrderLabel } from "./birthOrder";
import { ancestryRelationshipLabel, careRelationshipLabel } from "./parentConnections";
import { explorerCatalogs } from "./explorerCopy";
import { exportHeritgBackup, importHeritgBackup, validateAppData } from "./portability";
import { exportHeritgArchive, importHeritgArchive } from "./heritgArchive";
import { DatePickerField, malayCalendarLabels } from "./DatePickerField";
import { SettingsDialog } from "./SettingsDialog";
import { localizedError } from "./localizedError";
import type { AppActions } from "./store";
import type { FamilyRelationship } from "./types";

const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
const t = createTranslator("ms");
const initial = () => createInitialAppData("ms", { id: "tree", now: "2026-09-12T00:00:00Z" });

describe("Malaysian Malay coverage", () => {
  it("has every app and explorer message, without missing interpolation values", () => {
    for (const catalog of [messageCatalogs, explorerCatalogs]) {
      const english = catalog.en as Record<string, string>;
      const malay = catalog.ms as Record<string, string>;
      expect(Object.keys(malay).sort()).toEqual(Object.keys(english).sort());
      for (const [key, value] of Object.entries(malay)) {
        expect(value.trim(), key).not.toBe("");
        expect(placeholders(value), key).toEqual(placeholders(english[key]));
        expect(value, key).not.toMatch(/\b(?:nggak|banget|kamu|unduh|unggah|sandi|istri|tanggal|silsilah|pengaturan)\b/i);
      }
    }
  });
  it("uses Malaysian task and family terminology", () => {
    expect(t("settings")).toBe("Tetapan");
    expect(t("familyTrees")).toBe("Salasilah keluarga");
    expect(t("wife")).toBe("Isteri");
    expect(t("province")).toBe("Negeri / wilayah");
    expect(t("sharePassword")).toBe("Kata laluan perkongsian");
    expect(t("familyViewCount", { shown: 2, total: 12 })).toBe("Memaparkan 2 daripada 12 orang");
    expect(t("marriedOn", { date: "12 Sep 2026" })).toBe("Berkahwin pada 12 Sep 2026");
    expect(createTranslator("en")("settings")).toBe("Settings");
    expect(createTranslator("id")("indonesian")).toBe("Bahasa Indonesia");
  });
  it.each(["ms", "ms-MY", "ms-my", "MS_MY", "ms-SG"])("recognizes browser language %s", value => {
    expect(browserAppLanguage(value)).toBe("ms");
    expect(readUiLanguage({ getItem: () => null }, value)).toBe("ms");
  });
  it("persists the language and sets the document language across reloads", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    saveUiLanguage("ms", storage);
    const doc = { lang: "en" };
    expect(applyUiLanguage(doc, storage, "id-ID")).toBe("ms");
    expect(doc.lang).toBe("ms");
    expect(browserAppLanguage("my-MM")).toBe("en"); // Burmese is not Malay.
    expect(readUiLanguage({ getItem: () => { throw Error("blocked"); } }, "ms-MY")).toBe("ms");
  });
  it("localizes the initial tree and supports independent relationship choices", () => {
    const data = initial();
    expect(data.trees[0].title).toBe("Salasilah Keluarga Saya");
    expect(relationshipLanguageForData(data)).toBe("ms");
    const cultural = setRelationshipLanguage(data, "jv-yogyakarta");
    expect(setLanguage(cultural, "en").relationshipLanguage).toBe("jv-yogyakarta");
    expect(setRelationshipLanguage(cultural, "ms").relationshipLanguage).toBe("ms");
    expect(setLanguage(data, "id").trees[0].title).toBe(data.trees[0].title);
  });
  it("round-trips Malay preferences and preserves names, dates and notes in backups", () => {
    const data = createPerson(initial(), "tree", { displayName: "Nur Aisyah binti Ahmad", birthDate: "1995-08-31", notes: "Catatan asal: sekolah di Kuala Lumpur." }, { id: "person" });
    const copied = importHeritgBackup(exportHeritgBackup(data));
    expect(copied.language).toBe("ms");
    expect(copied.relationshipLanguage).toBe("ms");
    expect(copied.people[0].displayName).toBe(data.people[0].displayName);
    expect(copied.people[0].birthDate).toBe("1995-08-31");
    expect(copied.people[0].notes).toBe(data.people[0].notes);
    const legacy = { ...data, relationshipLanguage: undefined };
    expect(validateAppData(legacy).relationshipLanguage).toBe("ms");
    expect(replaceAppData(legacy).relationshipLanguage).toBe("ms");
  });
  it("imports encrypted .heritg files into a Malay workspace without changing its language", async () => {
    const data = createPerson(initial(), "tree", { displayName: "Ahmad bin Ali" }, { id: "person" });
    const blob = await exportHeritgArchive(data, data.trees[0].id, "Ujian123!");
    const imported = await importHeritgArchive(blob, "Ujian123!", { into: createInitialAppData("ms", { id: "destination" }) });
    expect(imported.language).toBe("ms");
    expect(imported.relationshipLanguage).toBe("ms");
    expect(imported.people.some(person => person.displayName === "Ahmad bin Ali")).toBe(true);
  });
  it("uses ms-MY dates and age summaries without changing ISO dates", () => {
    expect(localeForLanguage("ms")).toBe("ms-MY");
    expect(formatDisplayDate("1995-08-31", "ms")).toBe(new Intl.DateTimeFormat("ms-MY", { day: "numeric", month: "short", year: "numeric" }).format(new Date(1995, 7, 31)));
    expect(personLifeSummary({ birthDate: "1995-08-31", birthDatePrecision: "year" }, "ms", new Date(2026, 8, 12))).toBe("Lahir 1995 · umur 31 tahun");
    expect(birthOrderLabel(1, "ms")).toBe("Anak pertama");
    expect(birthOrderLabel(7, "ms")).toBe("Anak ke-7");
  });
  it("renders Malay settings and accessible month, year and day choices", () => {
    const settings = renderToStaticMarkup(<SettingsDialog data={initial()} actions={{} as AppActions} onClose={() => {}} t={t} />);
    expect(settings).toContain("Bahasa Melayu (Malaysia)");
    expect(settings).toContain("Bahasa pertalian keluarga");
    expect(settings).toContain("Tetapan");
    const calendar = renderToStaticMarkup(<DatePickerField label={t("birthDate")} value="1995-08-31" onChange={() => {}} language="ms" t={t} initiallyOpen />);
    expect(calendar).toContain("Ogos");
    expect(calendar).toContain("Pilih tahun");
    expect(calendar).toContain("Bulan seterusnya");
    expect(calendar).not.toContain("Go to the Next Month");
    expect(malayCalendarLabels.labelDayButton(new Date(1995, 7, 31), { today: true, selected: true })).toContain("Hari ini");
    expect(malayCalendarLabels.labelDayButton(new Date(1995, 7, 31), { selected: true })).toContain("dipilih");
  });
  it("keeps recovery advice in Malay without translating arbitrary user data", () => {
    expect(localizedError("Death date cannot be earlier than birth date.", "ms")).toContain("Tarikh meninggal dunia");
    expect(localizedError("The encrypted upload was interrupted. Please create a new link.", "ms")).toContain("cipta pautan baharu");
    expect(localizedError("Nur Aisyah binti Ahmad", "ms")).toBe("Nur Aisyah binti Ahmad");
  });
});

describe("Malay kinship semantics", () => {
  it.each([
    ["Mother", "Ibu"], ["Grandfather", "Datuk"], ["Grandmother", "Nenek"],
    ["Uncle", "Bapa saudara"], ["Aunt", "Ibu saudara"], ["Nephew", "Anak saudara lelaki"],
    ["Brother", "Adik-beradik lelaki"], ["Half-brother", "Saudara lelaki seibu atau sebapa"],
    ["Stepbrother", "Saudara tiri lelaki"], ["Guardian", "Penjaga"],
    ["Former wife", "Bekas isteri"], ["Second cousin", "Dua pupu"],
    ["First cousin once removed", "Sepupu (beza 1 generasi)"],
    ["Great-grandmother", "Moyang"], ["Great-grandson", "Cicit"],
    ["Uncle by marriage", "Bapa saudara melalui perkahwinan"]
  ])("labels %s as %s", (source, expected) => expect(malayKinshipLabel(source)).toBe(expected));
  it("uses Malay for direct and computed canvas labels, including care relationships", () => {
    let data = createPerson(initial(), "tree", { displayName: "Ibu", gender: "female" }, { id: "mother" });
    data = createPerson(data, "tree", { displayName: "Anak", gender: "male" }, { id: "child" });
    const edge: FamilyRelationship = { id: "r", treeId: data.trees[0].id, fromPersonId: "mother", toPersonId: "child", kind: "parent", subtype: "biologicalParent", createdAt: "2026-09-12" };
    expect(directRelationshipLabel(data.people[0], "child", [edge], "ms")).toBe("Ibu");
    expect(deriveKinshipLabels("child", data.people, [edge], "ms")).toEqual({ mother: "Ibu", child: "Individu terpilih" });
    expect(ancestryRelationshipLabel("adoptiveParent", "ms", 2)).toBe("Ibu bapa angkat");
    expect(careRelationshipLabel({ ...edge, subtype: "guardian" }, "ms")).toBe("Penjaga");
  });
});
