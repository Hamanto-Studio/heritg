import { describe, expect, it } from "vitest";

import { relationshipLabelText } from "./connectionGeometry";
import type { FamilyRelationship } from "./types";

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
