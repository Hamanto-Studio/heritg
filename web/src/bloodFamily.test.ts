import { describe, expect, it } from "vitest";

import { deriveBloodFamilyHighlight } from "./bloodFamily";
import type { FamilyRelationship, Person, RelationshipSubtype } from "./types";

const person = (id: string): Person => ({
  id,
  treeId: "tree",
  displayName: id,
  gender: "unspecified",
  createdAt: "2026-01-01T00:00:00.000Z",
  birthDatePrecision: "exact",
  notes: "",
  addressLine: "",
  city: "",
  province: "",
  country: "",
  postalCode: ""
});

const relationship = (
  id: string,
  fromPersonId: string,
  toPersonId: string,
  subtype: RelationshipSubtype = "biologicalParent"
): FamilyRelationship => ({
  id,
  treeId: "tree",
  fromPersonId,
  toPersonId,
  kind: subtype === "sibling" || subtype === "halfSibling" ? "sibling" : "parent",
  subtype,
  createdAt: "2026-01-01T00:00:00.000Z"
});

describe("blood family highlighting", () => {
  it("includes biological ancestors, descendants, and collateral relatives only", () => {
    const people = [
      "selected", "father", "mother", "grandfather", "sibling", "aunt", "cousin",
      "child", "co-parent", "partner", "adoptive-parent"
    ].map(person);
    const relationships = [
      relationship("father-selected", "father", "selected"),
      relationship("mother-selected", "mother", "selected"),
      relationship("grandfather-father", "grandfather", "father"),
      relationship("grandfather-aunt", "grandfather", "aunt"),
      relationship("aunt-cousin", "aunt", "cousin"),
      relationship("mother-sibling", "mother", "sibling"),
      relationship("selected-child", "selected", "child"),
      relationship("co-parent-child", "co-parent", "child"),
      relationship("adoptive-selected", "adoptive-parent", "selected", "adoptiveParent"),
      {
        ...relationship("selected-partner", "selected", "partner"),
        kind: "partner" as const,
        subtype: "partner" as const
      }
    ];

    const result = deriveBloodFamilyHighlight("selected", people, relationships);

    expect([...result.personIds].sort()).toEqual([
      "aunt", "child", "cousin", "father", "grandfather", "mother", "selected", "sibling"
    ]);
    expect([...result.relationshipIds].sort()).toEqual([
      "aunt-cousin", "father-selected", "grandfather-aunt", "grandfather-father",
      "mother-selected", "mother-sibling", "selected-child"
    ]);
  });

  it("uses explicit blood siblings without crossing an unrelated half-sibling chain", () => {
    const people = ["selected", "sibling", "sibling-child", "unrelated-half-sibling"].map(person);
    const relationships = [
      relationship("selected-sibling", "selected", "sibling", "sibling"),
      relationship("sibling-child", "sibling", "sibling-child"),
      relationship("half-sibling-chain", "sibling", "unrelated-half-sibling", "halfSibling")
    ];

    const result = deriveBloodFamilyHighlight("selected", people, relationships);

    expect([...result.personIds].sort()).toEqual(["selected", "sibling", "sibling-child"]);
    expect([...result.relationshipIds].sort()).toEqual(["selected-sibling", "sibling-child"]);
  });
});
