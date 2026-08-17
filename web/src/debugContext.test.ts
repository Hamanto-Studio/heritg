import { describe, expect, it } from "vitest";

import { buildActiveFamilyDebugContext } from "./debugContext";
import type { AppData } from "./types";

const data: AppData = {
  version: 1,
  trees: [
    {
      id: "other-tree",
      title: "Other",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    },
    {
      id: "active-tree",
      title: "Active family",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      lastSelectedPersonId: "person-2"
    }
  ],
  people: [
    {
      id: "person-1",
      treeId: "active-tree",
      displayName: "Parent",
      gender: "female",
      createdAt: "2026-01-01T00:00:00.000Z",
      birthDatePrecision: "exact",
      notes: "Private note",
      addressLine: "Street",
      city: "Jakarta",
      province: "Jakarta",
      country: "Indonesia",
      postalCode: "10000",
      photoDataUrl: "data:image/png;base64,private"
    },
    {
      id: "person-2",
      treeId: "active-tree",
      displayName: "Child",
      gender: "male",
      createdAt: "2026-01-02T00:00:00.000Z",
      birthDatePrecision: "year",
      notes: "",
      addressLine: "",
      city: "",
      province: "",
      country: "",
      postalCode: ""
    },
    {
      id: "person-3",
      treeId: "other-tree",
      displayName: "Not active",
      gender: "unspecified",
      createdAt: "2026-01-01T00:00:00.000Z",
      birthDatePrecision: "exact",
      notes: "",
      addressLine: "",
      city: "",
      province: "",
      country: "",
      postalCode: ""
    }
  ],
  relationships: [
    {
      id: "relationship-1",
      treeId: "active-tree",
      fromPersonId: "person-1",
      toPersonId: "person-2",
      kind: "parent",
      subtype: "biologicalParent",
      createdAt: "2026-01-02T00:00:00.000Z"
    }
  ],
  selectedTreeId: "active-tree",
  language: "en",
  viewports: {}
};

describe("buildActiveFamilyDebugContext", () => {
  it("includes only the active family with readable relationship endpoints", () => {
    const context = buildActiveFamilyDebugContext(data, "2026-08-17T00:00:00.000Z");

    expect(context.activeTree?.title).toBe("Active family");
    expect(context.selectedPersonId).toBe("person-2");
    expect(context.selectedPerson?.displayName).toBe("Child");
    expect(context.counts).toEqual({ people: 2, relationships: 1 });
    expect(context.people.map((person) => person.displayName)).toEqual(["Parent", "Child"]);
    expect(context.relationships[0]).toMatchObject({
      fromPersonName: "Parent",
      toPersonName: "Child"
    });
  });

  it("retains person details but omits photo contents", () => {
    const context = buildActiveFamilyDebugContext(data);
    const parent = context.people[0];

    expect(parent.notes).toBe("Private note");
    expect(parent.addressLine).toBe("Street");
    expect(parent.photo).toEqual({ present: true, omitted: true });
    expect(parent).not.toHaveProperty("photoDataUrl");
  });
});
