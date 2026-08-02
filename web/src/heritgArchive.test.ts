// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import {
  decodeHeritgZip,
  encodeHeritgZip,
  exportHeritgArchive,
  heritgArchiveProtection,
  importHeritgArchive
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
  });

  it("rejects the wrong password and authenticated-byte tampering", async () => {
    const archive = await exportHeritgArchive(syntheticData, "tree-synthetic", "correct horse battery staple");
    await expect(importHeritgArchive(archive, "wrong password")).rejects.toThrow(/incorrect|modified/i);

    const tampered = archive.slice();
    tampered[tampered.length - 20] ^= 1;
    await expect(importHeritgArchive(tampered, "correct horse battery staple")).rejects.toThrow(/incorrect|modified/i);
  });

  it("round-trips unencrypted ZIP archives and preserves portable identifiers", async () => {
    const archive = await exportHeritgArchive(syntheticData, "tree-synthetic", "");
    expect(heritgArchiveProtection(archive)).toBe("unencrypted");
    expect([...decodeHeritgZip(archive).keys()]).toContain("checksums.sha256");
    const restored = await importHeritgArchive(archive);
    expect(restored.trees[0]?.id).toBe("tree-synthetic");
    expect(restored.relationships[0]?.id).toBe("relationship-alpha-beta");
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
