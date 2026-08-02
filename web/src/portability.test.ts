// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { AppData } from "./types";
import {
  HERITG_FORMAT,
  exportGedcom,
  exportHeritgBackup,
  importGedcom,
  importHeritgBackup,
  parseGedcom,
  parseHeritgBackup,
  safeFilename
} from "./portability";

const timestamp = "2026-08-01T10:00:00.000Z";

const appData: AppData = {
  version: 1,
  trees: [
    {
      id: "tree-original",
      title: "Example Family",
      createdAt: timestamp,
      updatedAt: timestamp,
      lastSelectedPersonId: "person-child"
    }
  ],
  people: [
    {
      id: "person-father",
      treeId: "tree-original",
      displayName: "Parent Example One",
      gender: "male",
      createdAt: timestamp,
      birthDate: "1970-01-01",
      deathDate: undefined,
      birthDatePrecision: "exact",
      notes: "Family notes stay in a complete backup.",
      addressLine: "1 Example Street",
      city: "Example City",
      province: "Example Region",
      country: "Example Country",
      postalCode: "00000",
      photoDataUrl: "data:image/jpeg;base64,/9j/2Q=="
    },
    {
      id: "person-mother",
      treeId: "tree-original",
      displayName: "Parent Example Two",
      gender: "female",
      createdAt: timestamp,
      birthDate: "1972-04-01",
      deathDate: "2024-05-01",
      birthDatePrecision: "month",
      notes: "",
      addressLine: "",
      city: "Second Example City",
      province: "Second Example Region",
      country: "Example Country",
      postalCode: "",
      photoDataUrl: undefined
    },
    {
      id: "person-child",
      treeId: "tree-original",
      displayName: "Child Example",
      gender: "female",
      createdAt: timestamp,
      birthDate: "2000-01-02",
      deathDate: undefined,
      birthDatePrecision: "exact",
      notes: "",
      addressLine: "",
      city: "Third Example City",
      province: "Third Example Region",
      country: "Example Country",
      postalCode: "",
      photoDataUrl: undefined
    }
  ],
  relationships: [
    {
      id: "relationship-partners",
      treeId: "tree-original",
      fromPersonId: "person-father",
      toPersonId: "person-mother",
      kind: "partner",
      subtype: "spouse",
      createdAt: timestamp,
      marriageDate: "1995-06-10"
    },
    {
      id: "relationship-father-child",
      treeId: "tree-original",
      fromPersonId: "person-father",
      toPersonId: "person-child",
      kind: "parent",
      subtype: "biologicalParent",
      createdAt: timestamp,
      marriageDate: undefined
    },
    {
      id: "relationship-mother-child",
      treeId: "tree-original",
      fromPersonId: "person-mother",
      toPersonId: "person-child",
      kind: "parent",
      subtype: "biologicalParent",
      createdAt: timestamp,
      marriageDate: undefined
    }
  ],
  selectedTreeId: "tree-original",
  language: "id",
  viewports: {
    "tree-original": { scrollX: 120, scrollY: -40, zoom: 1.25 }
  }
};

const sequence = (...ids: string[]) => {
  let index = 0;
  return () => ids[index++];
};

describe("HERITG JSON backups", () => {
  it("exports all app data and imports it with remapped IDs", () => {
    const source = exportHeritgBackup(appData, timestamp);
    const parsed = parseHeritgBackup(source);

    expect(parsed.format).toBe(HERITG_FORMAT);
    expect(parsed.exportedAt).toBe(timestamp);
    expect(parsed.data).toEqual(appData);

    const restored = importHeritgBackup(source, {
      idFactory: sequence(
        "new-tree",
        "new-father",
        "new-mother",
        "new-child",
        "new-partners",
        "new-father-child",
        "new-mother-child"
      )
    });

    expect(restored.trees[0].id).toBe("new-tree");
    expect(restored.trees[0].lastSelectedPersonId).toBe("new-child");
    expect(restored.selectedTreeId).toBe("new-tree");
    expect(restored.viewports["new-tree"]).toEqual(appData.viewports["tree-original"]);
    expect(restored.people.map((person) => person.id)).toEqual([
      "new-father",
      "new-mother",
      "new-child"
    ]);
    expect(restored.people[0].photoDataUrl).toBe(appData.people[0].photoDataUrl);
    expect(restored.relationships[0]).toMatchObject({
      id: "new-partners",
      treeId: "new-tree",
      fromPersonId: "new-father",
      toPersonId: "new-mother"
    });
  });

  it("rejects unsupported schemas and missing relationship endpoints", () => {
    const backup = JSON.parse(exportHeritgBackup(appData, timestamp));
    backup.schemaVersion = 2;
    expect(() => parseHeritgBackup(JSON.stringify(backup))).toThrow(/schema/i);

    backup.schemaVersion = 1;
    backup.data.relationships[0].toPersonId = "person-missing";
    expect(() => importHeritgBackup(JSON.stringify(backup))).toThrow(/endpoint/i);
  });
});

describe("GEDCOM 7 portability", () => {
  it("round-trips supported person, event, place, and family fields", () => {
    const gedcom = exportGedcom(appData, "tree-original");
    expect(gedcom).toContain("2 VERS 7.0");
    expect(gedcom).toContain("1 NAME Parent Example One");
    expect(gedcom).toContain("2 DATE 1 JAN 1970");
    expect(gedcom).toContain("1 DEAT\r\n2 DATE 1 MAY 2024");
    expect(gedcom).toContain("2 CITY Example City");
    expect(gedcom).toMatch(/1 HUSB @I\d+@/);
    expect(gedcom).toMatch(/1 WIFE @I\d+@/);
    expect(gedcom).toContain("1 CHIL @I3@");
    expect(gedcom).toContain("1 MARR\r\n2 DATE 10 JUN 1995");

    const parsed = parseGedcom(gedcom);
    expect(parsed.people).toHaveLength(3);
    expect(parsed.people.find((person) => person.displayName === "Parent Example Two")).toMatchObject({
      gender: "female",
      birthDate: "1972-04-01",
      birthDatePrecision: "month",
      deathDate: "2024-05-01",
      city: "Second Example City"
    });
    expect(parsed.families).toEqual([
      {
        parents: ["I1", "I2"],
        children: ["I3"],
        married: true,
        marriageDate: "1995-06-10"
      }
    ]);

    const imported = importGedcom(gedcom, {
      title: "GEDCOM Import",
      language: "en",
      now: timestamp,
      idFactory: sequence(
        "ged-tree",
        "ged-father",
        "ged-mother",
        "ged-child",
        "ged-partners",
        "ged-father-child",
        "ged-mother-child"
      )
    });
    expect(imported.trees[0].title).toBe("GEDCOM Import");
    expect(imported.people.map((person) => person.displayName)).toEqual([
      "Parent Example One",
      "Parent Example Two",
      "Child Example"
    ]);
    expect(imported.relationships).toHaveLength(3);
    expect(imported.relationships[0]).toMatchObject({
      kind: "partner",
      subtype: "spouse",
      marriageDate: "1995-06-10"
    });
    expect(imported.relationships.slice(1)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fromPersonId: "ged-father", toPersonId: "ged-child", kind: "parent" }),
        expect.objectContaining({ fromPersonId: "ged-mother", toPersonId: "ged-child", kind: "parent" })
      ])
    );
  });

  it("rejects broken family references and makes safe filenames", () => {
    const broken = "0 HEAD\n1 GEDC\n2 VERS 7.0\n0 @I1@ INDI\n1 NAME Person\n0 @F1@ FAM\n1 CHIL @I2@\n0 TRLR\n";
    expect(() => parseGedcom(broken)).toThrow(/missing person/i);
    expect(safeFilename("../../<Family>: 2026", "json")).toBe("-.-Family- 2026.json");
  });
});
