import { describe, expect, it } from "vitest";

import { birthOrderLabel, deriveBirthOrders } from "./birthOrder";
import type { FamilyRelationship, Person } from "./types";

const person = (
  id: string,
  birthDate?: string,
  birthDatePrecision: Person["birthDatePrecision"] = "exact",
  birthOrderOverride?: number
): Person => ({
  id,
  treeId: "tree",
  displayName: id,
  gender: "unspecified",
  birthDate,
  birthOrderOverride,
  birthDatePrecision,
  notes: "",
  addressLine: "",
  city: "",
  province: "",
  country: "",
  postalCode: "",
  createdAt: "2026-01-01T00:00:00.000Z"
});

const parent = (parentId: string, childId: string): FamilyRelationship => ({
  id: `${parentId}-${childId}`,
  treeId: "tree",
  fromPersonId: parentId,
  toPersonId: childId,
  kind: "parent",
  subtype: "biologicalParent",
  createdAt: "2026-01-01T00:00:00.000Z"
});

const familyRelationships = [
  parent("father", "oldest"), parent("mother", "oldest"),
  parent("father", "middle"), parent("mother", "middle"),
  parent("father", "youngest"), parent("mother", "youngest")
];

describe("birth order", () => {
  it("describes ordinal badges in English and Indonesian", () => {
    expect([1, 2, 3, 4, 11, 22].map((order) => birthOrderLabel(order, "en"))).toEqual([
      "First child", "Second child", "Third child", "4th child", "11th child", "22nd child"
    ]);
    expect([1, 2, 3, 4].map((order) => birthOrderLabel(order, "id"))).toEqual([
      "Anak pertama", "Anak kedua", "Anak ketiga", "Anak ke-4"
    ]);
  });

  it("derives order from reliable dates without changing person layout", () => {
    const people = [
      person("father"), person("mother"),
      person("youngest", "2002-03-01"),
      person("oldest", "1998-01-01"),
      person("middle", "2000-02-01")
    ];

    expect(Object.fromEntries(deriveBirthOrders(people, familyRelationships))).toEqual({
      oldest: 1,
      middle: 2,
      youngest: 3
    });
  });

  it("hides order when a sibling date is missing or date ranges overlap", () => {
    const missing = [
      person("father"), person("mother"),
      person("oldest", "1998-01-01"), person("middle"), person("youngest", "2002-03-01")
    ];
    const overlapping = [
      person("father"), person("mother"),
      person("oldest", "2000-01-01", "year"),
      person("middle", "2000-08-01", "month"),
      person("youngest", "2002-03-01")
    ];

    expect(deriveBirthOrders(missing, familyRelationships).size).toBe(0);
    expect(deriveBirthOrders(overlapping, familyRelationships).size).toBe(0);
  });

  it("uses a manual order instead of the inferred order", () => {
    const people = [
      person("father"), person("mother"),
      person("oldest", "1998-01-01", "exact", 2),
      person("middle", "2000-02-01"),
      person("youngest", "2002-03-01")
    ];

    expect(Object.fromEntries(deriveBirthOrders(people, familyRelationships))).toEqual({
      oldest: 2,
      middle: 2,
      youngest: 3
    });
  });

  it("uses a manual order when dates cannot be inferred and falls back after clearing it", () => {
    const manuallyOrdered = [
      person("father"), person("mother"),
      person("oldest", undefined, "exact", 1), person("middle"), person("youngest")
    ];
    expect(Object.fromEntries(deriveBirthOrders(manuallyOrdered, familyRelationships))).toEqual({
      oldest: 1
    });

    const dated = [
      person("father"), person("mother"),
      person("oldest", "1998-01-01"), person("middle", "2000-02-01"),
      person("youngest", "2002-03-01")
    ];
    expect(Object.fromEntries(deriveBirthOrders(dated, familyRelationships))).toEqual({
      oldest: 1,
      middle: 2,
      youngest: 3
    });
  });
});
