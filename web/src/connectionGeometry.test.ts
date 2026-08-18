import { describe, expect, it } from "vitest";

import { nodeLabelRect, parentPortY, relationshipLabelText } from "./connectionGeometry";
import { PERSON_NAME_LINE_HEIGHT } from "./personName";
import type { FamilyRelationship, PositionedPerson } from "./types";

const formerRelationship: FamilyRelationship = {
  id: "former",
  treeId: "tree",
  fromPersonId: "partner-a",
  toPersonId: "partner-b",
  kind: "partner",
  subtype: "formerSpouse",
  createdAt: "2026-01-01T00:00:00.000Z",
  marriageDate: "2004-01-02",
  divorceDate: "2020-03-04"
};

describe("relationship labels", () => {
  it("exposes marriage and divorce dates for former unions", () => {
    expect(relationshipLabelText(formerRelationship, "en"))
      .toBe("Married Jan 2, 2004 · Divorced Mar 4, 2020");
    expect(relationshipLabelText(formerRelationship, "id"))
      .toBe("Menikah 2 Jan 2004 · Bercerai 4 Mar 2020");
  });

  it("exposes a divorce-only label and ignores non-partner relationships", () => {
    expect(relationshipLabelText({
      ...formerRelationship,
      marriageDate: undefined
    }, "en")).toBe("Divorced Mar 4, 2020");
    expect(relationshipLabelText({
      ...formerRelationship,
      kind: "sibling",
      subtype: "sibling"
    }, "en")).toBeUndefined();
  });
});

describe("person label geometry", () => {
  const person: PositionedPerson = {
    id: "person",
    treeId: "tree",
    displayName: "Short Name",
    gender: "unspecified",
    createdAt: "2026-01-01T00:00:00.000Z",
    birthDate: "1990-01-01",
    birthDatePrecision: "exact",
    notes: "",
    addressLine: "",
    city: "",
    province: "",
    country: "",
    postalCode: "",
    x: 0,
    y: 0,
    role: "Selected person",
    generation: 0
  };

  it("reserves another line before routing connectors below long names", () => {
    const shortRect = nodeLabelRect(person);
    const longPerson = {
      ...person,
      displayName: "Novian Pratomo Edi Nugroho (Novan)"
    };
    const longRect = nodeLabelRect(longPerson);

    expect(longRect.height).toBe(shortRect.height + PERSON_NAME_LINE_HEIGHT);
    expect(parentPortY(longPerson)).toBe(parentPortY(person) + PERSON_NAME_LINE_HEIGHT);
  });

  it("reserves a separate line below life details for the current city", () => {
    const cityPerson = { ...person, city: "Jakarta" };

    expect(nodeLabelRect(cityPerson).height)
      .toBe(nodeLabelRect(person).height + 16);
    expect(parentPortY(cityPerson)).toBe(parentPortY(person) + 16);
  });
});
