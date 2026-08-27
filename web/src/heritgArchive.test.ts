// @vitest-environment node
import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

import {
  decodeHeritgZip,
  encodeHeritgZip,
  exportCanonicalHeritgArchive,
  exportHeritgArchive,
  heritgArchiveProtection,
  importHeritgArchive,
  sharedViewFor
} from "./heritgArchive";
import type { AppData } from "./types";

const syntheticData: AppData = {
  version: 1,
  trees: [{
    id: "tree-synthetic",
    title: "Synthetic Family",
    createdAt: "2020-09-13T12:26:40.000Z",
    updatedAt: "2023-11-14T22:13:20.000Z",
    lastSelectedPersonId: "person-alpha"
  }],
  people: [
    {
      id: "person-alpha",
      treeId: "tree-synthetic",
      displayName: "Ayu Élodie",
      gender: "female",
      createdAt: "2020-09-13T12:28:20.000Z",
      birthDate: "1985-04-12",
      birthDatePrecision: "exact",
      notes: "Synthetic notes only",
      addressLine: "",
      city: "Bandung",
      province: "West Java",
      country: "Indonesia",
      postalCode: "40123",
      photoDataUrl: "data:image/png;base64,iVBORw0KGgoBAgM="
    },
    {
      id: "person-beta",
      treeId: "tree-synthetic",
      displayName: "Bima",
      gender: "male",
      createdAt: "2020-09-13T12:30:00.000Z",
      birthDate: "1983-09-02",
      birthDatePrecision: "month",
      notes: "",
      addressLine: "",
      city: "",
      province: "",
      country: "",
      postalCode: ""
    }
  ],
  relationships: [{
    id: "relationship-alpha-beta",
    treeId: "tree-synthetic",
    fromPersonId: "person-alpha",
    toPersonId: "person-beta",
    kind: "partner",
    subtype: "spouse",
    createdAt: "2022-04-15T05:20:00.000Z",
    marriageDate: "2010-06-20"
  }],
  selectedTreeId: "tree-synthetic",
  language: "en",
  viewports: { "tree-synthetic": { scrollX: 0, scrollY: 0, zoom: 1 } }
};

const sha256 = async (bytes: Uint8Array) =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.slice().buffer as ArrayBuffer))]
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");

const compatibilityFixture = async () => {
  const paths = [
    "manifest.json",
    "tree.json",
    "people.jsonl",
    "relationships.jsonl",
    "checksums.sha256"
  ];
  return new Map(await Promise.all(paths.map(async (path) => [
    path,
    new Uint8Array(await readFile(new URL(`../../tests/compatibility/heritg-v1/${path}`, import.meta.url)))
  ] as const)));
};

const openEnvelopeForCompatibilityTest = async (archive: Uint8Array, password: string) => {
  const header = archive.slice(0, 44);
  const salt = archive.slice(16, 32);
  const nonce = archive.slice(32, 44);
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password.normalize("NFC")),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 600_000 },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  return new Uint8Array(await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce, additionalData: header, tagLength: 128 },
    key,
    archive.slice(44)
  ));
};

describe("cross-platform .heritg archive", () => {
  it("matches the published iOS and Android encrypted compatibility vector", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2023-11-14T22:13:20.000Z"));
    let entropyCall = 0;
    const random = vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(((target: Uint8Array) => {
      const start = entropyCall++ % 2 === 0 ? 0 : 16;
      target.forEach((_, index) => { target[index] = start + index; });
      return target;
    }) as typeof globalThis.crypto.getRandomValues);

    let archive: Uint8Array;
    let equivalent: Uint8Array;
    try {
      archive = await exportHeritgArchive(syntheticData, "tree-synthetic", "Cafe\u0301 family");
      equivalent = await exportHeritgArchive(syntheticData, "tree-synthetic", "Café family");
    } finally {
      random.mockRestore();
      vi.useRealTimers();
    }

    expect(archive).toEqual(equivalent);
    expect(new TextDecoder().decode(archive.slice(0, 8))).toBe("HTGENC01");
    expect([...archive.slice(8, 16)]).toEqual([0, 1, 1, 1, 0, 9, 39, 192]);
    expect(await sha256(archive)).toBe("2806b437258da23ca3e0f1f57df81ae69467869ed9d9e8e0c84e00cb9bcd2780");

    const restored = await importHeritgArchive(archive, "Café family");
    expect(restored.trees[0]?.id).toBe("tree-synthetic");
    expect(restored.people.map((person) => person.id)).toEqual(["person-alpha", "person-beta"]);
    expect(restored.people[0]?.photoDataUrl).toBe(syntheticData.people[0]?.photoDataUrl);
    expect(restored.viewports["tree-synthetic"]).toBeUndefined();
  });

  it("rejects the wrong password and authenticated-byte tampering", async () => {
    const archive = await exportHeritgArchive(syntheticData, "tree-synthetic", "correct horse battery staple");
    await expect(importHeritgArchive(archive, "wrong password")).rejects.toThrow(/incorrect|modified/i);

    const tampered = archive.slice();
    tampered[tampered.length - 20] ^= 1;
    await expect(importHeritgArchive(tampered, "correct horse battery staple")).rejects.toThrow(/incorrect|modified/i);
  });

  it("encrypts with an empty password and restores without password entry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2023-11-14T22:13:20.000Z"));
    let entropyCall = 0;
    const random = vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(((target: Uint8Array) => {
      const start = entropyCall++ % 2 === 0 ? 0 : 16;
      target.forEach((_, index) => { target[index] = start + index; });
      return target;
    }) as typeof globalThis.crypto.getRandomValues);

    let archive: Uint8Array;
    try {
      archive = await exportHeritgArchive(syntheticData, "tree-synthetic", "");
    } finally {
      random.mockRestore();
      vi.useRealTimers();
    }

    expect(heritgArchiveProtection(archive)).toBe("encrypted");
    expect(await sha256(archive)).toBe("bc8df41b6991455fdad8150c610e56f32d0146ee117bbb7cb2636d3732595440");
    expect((await importHeritgArchive(archive)).trees[0]?.id).toBe("tree-synthetic");
  });

  it("still reads legacy unencrypted ZIP archives", async () => {
    const encrypted = await exportHeritgArchive(syntheticData, "tree-synthetic", "");
    const legacyArchive = await openEnvelopeForCompatibilityTest(encrypted, "");
    expect(heritgArchiveProtection(legacyArchive)).toBe("unencrypted");
    expect([...decodeHeritgZip(legacyArchive).keys()]).toContain("checksums.sha256");
    const restored = await importHeritgArchive(legacyArchive);
    expect(restored.trees[0]?.id).toBe("tree-synthetic");
    expect(restored.relationships[0]?.id).toBe("relationship-alpha-beta");
  });

  it("reads the shared mobile fixture and defaults absent additive fields", async () => {
    const restored = await importHeritgArchive(encodeHeritgZip(await compatibilityFixture()));

    expect(restored.people[0].birthOrderOverride).toBe(2);
    expect(restored.people[0]).toMatchObject({
      birthPlace: "",
      deathPlace: "",
      deathDatePrecision: "exact"
    });
    expect(restored.people[1]).toMatchObject({
      birthPlace: "",
      deathPlace: "",
      deathDatePrecision: "exact"
    });
    expect(restored.people[1]).not.toHaveProperty("birthOrderOverride", expect.any(Number));
    expect(restored.relationships[0].marriageDatePrecision).toBe("exact");
  });

  it("round-trips additive schema-v1 divorce dates for both former union subtypes", async () => {
    for (const subtype of ["formerPartner", "formerSpouse"] as const) {
      const source = structuredClone(syntheticData);
      source.relationships[0].subtype = subtype;
      source.relationships[0].divorceDate = "2021-07-08";

      const archive = await exportHeritgArchive(source, "tree-synthetic", "archive-pass");
      const zip = await openEnvelopeForCompatibilityTest(archive, "archive-pass");
      const files = decodeHeritgZip(zip);
      const relationshipRecord = JSON.parse(
        new TextDecoder().decode(files.get("relationships.jsonl"))
      );
      expect(relationshipRecord).toMatchObject({
        schemaVersion: 1,
        subtype,
        marriageDate: "2010-06-20",
        divorceDate: "2021-07-08"
      });

      const restored = await importHeritgArchive(archive, "archive-pass");
      expect(restored.relationships[0]).toMatchObject({ subtype, divorceDate: "2021-07-08" });
    }

    const invalid = structuredClone(syntheticData);
    invalid.relationships[0].subtype = "formerSpouse";
    invalid.relationships[0].divorceDate = "2009-01-01";
    await expect(exportHeritgArchive(invalid, "tree-synthetic", "archive-pass"))
      .rejects.toThrow(/earlier than marriageDate/i);
  });

  it("rejects a checksummed divorce date on a non-former relationship", async () => {
    const files = await compatibilityFixture();
    const relationshipRecord = JSON.parse(
      new TextDecoder().decode(files.get("relationships.jsonl"))
    );
    relationshipRecord.divorceDate = "2020-04-05";
    const relationshipBytes = new TextEncoder().encode(`${JSON.stringify(relationshipRecord)}\n`);
    files.set("relationships.jsonl", relationshipBytes);

    const checksums = new TextDecoder().decode(files.get("checksums.sha256"));
    files.set("checksums.sha256", new TextEncoder().encode(checksums.replace(
      /^[0-9a-f]{64}( {2}relationships\.jsonl)$/m,
      `${await sha256(relationshipBytes)}$1`
    )));

    await expect(importHeritgArchive(encodeHeritgZip(files)))
      .rejects.toThrow(/only valid for former unions/i);
  });

  it("round-trips additive mobile fields and omits their empty defaults", async () => {
    const source = structuredClone(syntheticData);
    source.people[0].birthOrderOverride = 2;
    source.people[0].birthPlace = "Bandung, Indonesia";
    source.people[0].deathPlace = "Jakarta, Indonesia";
    source.people[0].deathDatePrecision = "year";
    source.relationships[0].marriageDatePrecision = "month";

    const archive = await exportHeritgArchive(source, "tree-synthetic", "archive-pass");
    const zip = await openEnvelopeForCompatibilityTest(archive, "archive-pass");
    const files = decodeHeritgZip(zip);
    const records = new TextDecoder().decode(
      files.get("people.jsonl")
    ).trimEnd().split("\n").map((line) => JSON.parse(line));
    const relationshipRecord = JSON.parse(new TextDecoder().decode(
      files.get("relationships.jsonl")
    ));
    expect(records[0]).toMatchObject({
      birthOrderOverride: 2,
      birthPlace: "Bandung, Indonesia",
      deathPlace: "Jakarta, Indonesia",
      deathDatePrecision: "year"
    });
    expect(records[1]).not.toHaveProperty("birthOrderOverride");
    expect(records[1]).not.toHaveProperty("birthPlace");
    expect(records[1]).not.toHaveProperty("deathPlace");
    expect(records[1]).not.toHaveProperty("deathDatePrecision");
    expect(relationshipRecord.marriageDatePrecision).toBe("month");

    const defaultArchive = await exportCanonicalHeritgArchive(
      syntheticData,
      "tree-synthetic",
      "2026-01-01T00:00:00.000Z"
    );
    const defaultRelationship = JSON.parse(new TextDecoder().decode(
      decodeHeritgZip(defaultArchive).get("relationships.jsonl")
    ));
    expect(defaultRelationship).not.toHaveProperty("marriageDatePrecision");

    const restored = await importHeritgArchive(archive, "archive-pass");
    expect(restored.people[0]).toMatchObject({
      birthOrderOverride: 2,
      birthPlace: "Bandung, Indonesia",
      deathPlace: "Jakarta, Indonesia",
      deathDatePrecision: "year"
    });
    expect(restored.people[1]).toMatchObject({
      birthPlace: "",
      deathPlace: "",
      deathDatePrecision: "exact"
    });
    expect(restored.relationships[0].marriageDatePrecision).toBe("month");
  });

  it("round-trips encrypted-share display policy without adding archive entries", async () => {
    const archive = await exportCanonicalHeritgArchive(
      syntheticData,
      "tree-synthetic",
      "2026-08-09T00:00:00.000Z",
      {
        sharedView: {
          birthDates: false,
          relationshipDates: false,
          photos: false,
          ages: true,
          ageByPersonId: { "person-alpha": 41, "person-beta": 42 }
        }
      }
    );
    expect([...decodeHeritgZip(archive).keys()].filter((path) => !path.startsWith("media/")))
      .toEqual(expect.arrayContaining([
        "manifest.json",
        "tree.json",
        "people.jsonl",
        "relationships.jsonl",
        "checksums.sha256"
      ]));
    const restored = await importHeritgArchive(archive);
    expect(sharedViewFor(restored)).toEqual({
      birthDates: false,
      relationshipDates: false,
      photos: false,
      ages: true,
      ageByPersonId: { "person-alpha": 41, "person-beta": 42 }
    });
  });

  it("preserves relationship language independently in shared archives", async () => {
    const archive = await exportCanonicalHeritgArchive(
      { ...syntheticData, relationshipLanguage: "bbc-toba" },
      "tree-synthetic",
      undefined,
      {
        sharedView: {
          birthDates: true,
          relationshipDates: true,
          photos: true,
          ages: true,
          ageByPersonId: {}
        }
      }
    );

    const restored = await importHeritgArchive(archive);
    expect(restored.language).toBe("en");
    expect(restored.relationshipLanguage).toBe("bbc-toba");
  });

  it("preserves migrated legacy terminology in shared archives", async () => {
    const archive = await exportCanonicalHeritgArchive(
      {
        ...syntheticData,
        language: "id",
        relationshipTerminology: "btx-karo"
      },
      "tree-synthetic",
      undefined,
      {
        sharedView: {
          birthDates: true,
          relationshipDates: true,
          photos: true,
          ages: true,
          ageByPersonId: {}
        }
      }
    );

    expect((await importHeritgArchive(archive)).relationshipLanguage).toBe("btx-karo");
  });

  it("rejects identifier collisions atomically when importing into existing data", async () => {
    const archive = await exportHeritgArchive(syntheticData, "tree-synthetic", "");
    await expect(importHeritgArchive(archive, "", { into: syntheticData })).rejects.toThrow(/identifier/i);
  });

  it("rejects unsafe ZIP paths and bytes outside records", async () => {
    expect(() => encodeHeritgZip(new Map([["../tree.json", new Uint8Array()]]))).toThrow(/path/i);
    const archive = await exportHeritgArchive(syntheticData, "tree-synthetic", "");
    const trailing = new Uint8Array(archive.length + 1);
    trailing.set(archive);
    await expect(importHeritgArchive(trailing)).rejects.toThrow(/ZIP|archive/i);
  });
});
