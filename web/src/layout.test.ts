import { describe, expect, it } from "vitest";
import { createConnectionPlan } from "./connectionPlan";
import { directRelationshipLabel, kinshipLabel } from "./kinship";
import {
  LAYOUT_METRICS,
  availableGenerationLevels,
  createTreeLayout,
  filterByGeneration
} from "./layout";
import type {
  FamilyRelationship,
  Gender,
  Person,
  RelationshipKind,
  RelationshipSubtype
} from "./types";

const person = (
  id: string,
  gender: Gender = "unspecified",
  birthDate?: string
): Person => ({
  id,
  treeId: "tree",
  displayName: id.charAt(0).toUpperCase() + id.slice(1),
  gender,
  createdAt: "2026-01-01T00:00:00.000Z",
  birthDate,
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
  kind: RelationshipKind,
  subtype: RelationshipSubtype
): FamilyRelationship => ({
  id,
  treeId: "tree",
  fromPersonId,
  toPersonId,
  kind,
  subtype,
  createdAt: "2026-01-01T00:00:00.000Z"
});

const parent = (
  fromPersonId: string,
  toPersonId: string,
  id = `${fromPersonId}-${toPersonId}`,
  subtype: RelationshipSubtype = "biologicalParent"
) => relationship(id, fromPersonId, toPersonId, "parent", subtype);

const partner = (fromPersonId: string, toPersonId: string, id = "partner") =>
  relationship(id, fromPersonId, toPersonId, "partner", "spouse");

describe("kinship labels", () => {
  it("derives direct and multi-generation labels relative to the selection", () => {
    const people = [
      person("great-grandfather", "male"),
      person("grandmother", "female"),
      person("father", "male"),
      person("focus"),
      person("sister", "female"),
      person("wife", "female"),
      person("daughter", "female"),
      person("grandson", "male")
    ];
    const relationships = [
      parent("great-grandfather", "grandmother"),
      parent("grandmother", "father"),
      parent("father", "focus"),
      parent("father", "sister"),
      partner("focus", "wife"),
      parent("focus", "daughter"),
      parent("daughter", "grandson")
    ];

    expect(kinshipLabel("focus", "focus", people, relationships)).toBe("You");
    expect(kinshipLabel("father", "focus", people, relationships)).toBe("Father");
    expect(kinshipLabel("grandmother", "focus", people, relationships)).toBe(
      "Grandmother"
    );
    expect(kinshipLabel("great-grandfather", "focus", people, relationships)).toBe(
      "Great-grandfather"
    );
    expect(kinshipLabel("sister", "focus", people, relationships)).toBe("Sister");
    expect(kinshipLabel("wife", "focus", people, relationships)).toBe("Wife");
    expect(kinshipLabel("daughter", "focus", people, relationships)).toBe("Daughter");
    expect(kinshipLabel("grandson", "focus", people, relationships)).toBe("Grandson");
  });

  it("labels lineage branches and explicit relationship subtypes", () => {
    const people = [
      person("root"),
      person("father", "male"),
      person("focus"),
      person("aunt", "female"),
      person("cousin"),
      person("adoptive-mother", "female"),
      person("half-sister", "female")
    ];
    const relationships = [
      parent("root", "father"),
      parent("father", "focus"),
      parent("root", "aunt"),
      parent("aunt", "cousin"),
      parent("adoptive-mother", "focus", "adoptive", "adoptiveParent"),
      relationship("half", "focus", "half-sister", "sibling", "halfSibling")
    ];

    expect(kinshipLabel("aunt", "focus", people, relationships)).toBe("Aunt");
    expect(kinshipLabel("cousin", "focus", people, relationships)).toBe(
      "First cousin"
    );
    expect(
      directRelationshipLabel(people[5], "focus", relationships)
    ).toBe("Adoptive mother");
    expect(kinshipLabel("half-sister", "focus", people, relationships)).toBe(
      "Half-sister"
    );
  });

  it("matches iOS labels for parents, children, siblings, and extended family by marriage", () => {
    const people = [
      person("focus", "male"), person("spouse", "female"),
      person("spouse-father", "male"), person("spouse-mother", "female"),
      person("spouse-brother", "male"), person("spouse-grandmother", "female"),
      person("daughter", "female"), person("daughter-husband", "male"),
      person("son", "male"), person("son-wife", "female"),
      person("focus-parent"), person("focus-sister", "female"), person("sister-husband", "male")
    ];
    const relationships = [
      partner("focus", "spouse", "focus-spouse"),
      parent("spouse-father", "spouse"), parent("spouse-mother", "spouse"),
      parent("spouse-father", "spouse-brother"), parent("spouse-grandmother", "spouse-mother"),
      parent("focus", "daughter"), partner("daughter", "daughter-husband", "daughter-marriage"),
      parent("focus", "son"), partner("son", "son-wife", "son-marriage"),
      parent("focus-parent", "focus"), parent("focus-parent", "focus-sister"),
      partner("focus-sister", "sister-husband", "sister-marriage")
    ];

    expect(kinshipLabel("spouse-father", "focus", people, relationships)).toBe("Father-in-law");
    expect(kinshipLabel("spouse-mother", "focus", people, relationships)).toBe("Mother-in-law");
    expect(kinshipLabel("daughter-husband", "focus", people, relationships)).toBe("Son-in-law");
    expect(kinshipLabel("son-wife", "focus", people, relationships)).toBe("Daughter-in-law");
    expect(kinshipLabel("spouse-brother", "focus", people, relationships)).toBe("Brother-in-law");
    expect(kinshipLabel("sister-husband", "focus", people, relationships)).toBe("Brother-in-law");
    expect(kinshipLabel("spouse-grandmother", "focus", people, relationships)).toBe("Grandmother by marriage");
    expect(kinshipLabel("spouse-mother", "focus", people, relationships, "id")).toBe("Ibu mertua");
    expect(kinshipLabel("son-wife", "focus", people, relationships, "id")).toBe("Menantu perempuan");
  });
});

describe("deterministic family layout", () => {
  const people = [
    person("grandfather", "male", "1940-01-01"),
    person("grandmother", "female", "1942-01-01"),
    person("father", "male", "1965-01-01"),
    person("mother", "female", "1968-01-01"),
    person("focus", "unspecified", "1990-01-01"),
    person("sibling", "female", "1992-01-01"),
    person("spouse", "female", "1991-01-01"),
    person("child", "male", "2020-01-01")
  ];
  const relationships = [
    partner("grandfather", "grandmother", "grandparents"),
    parent("grandfather", "father"),
    parent("grandmother", "father"),
    partner("father", "mother", "parents"),
    parent("father", "focus"),
    parent("mother", "focus"),
    parent("father", "sibling"),
    parent("mother", "sibling"),
    partner("focus", "spouse", "focus-spouse"),
    parent("focus", "child"),
    parent("spouse", "child")
  ];

  it("uses asymmetric circular-node bounds with labels beneath the avatar", () => {
    const layout = createTreeLayout([person("focus")], [], "focus");

    expect(layout.bounds).toMatchObject({
      minX: -LAYOUT_METRICS.labelWidth / 2,
      maxX: LAYOUT_METRICS.labelWidth / 2,
      minY: -LAYOUT_METRICS.avatarRadius,
      maxY: LAYOUT_METRICS.nodeBottom
    });
  });

  it("is stable across input permutations and keeps every parent above its child", () => {
    const first = createTreeLayout(people, relationships, "focus");
    const second = createTreeLayout(
      [...people].reverse(),
      [...relationships].reverse(),
      "focus"
    );
    const coordinates = (layout: typeof first) =>
      layout.people.map(({ id, x, y, generation, role }) => ({
        id,
        x,
        y,
        generation,
        role
      }));

    expect(coordinates(second)).toEqual(coordinates(first));
    expect(second.relationships.map(({ id }) => id)).toEqual(
      first.relationships.map(({ id }) => id)
    );

    const positioned = new Map(first.people.map((value) => [value.id, value]));
    for (const value of first.relationships.filter(({ kind }) => kind === "parent")) {
      expect(positioned.get(value.fromPersonId)?.y).toBeLessThan(
        positioned.get(value.toPersonId)?.y ?? Number.NEGATIVE_INFINITY
      );
    }
  });

  it("keeps partners on one row and adjacent", () => {
    const layout = createTreeLayout(people, relationships, "focus");
    const focus = layout.people.find(({ id }) => id === "focus");
    const spouse = layout.people.find(({ id }) => id === "spouse");
    const row = layout.people
      .filter(({ y }) => y === focus?.y)
      .sort((left, right) => left.x - right.x);

    expect(spouse?.y).toBe(focus?.y);
    expect(
      Math.abs(row.findIndex(({ id }) => id === "focus") - row.findIndex(({ id }) => id === "spouse"))
    ).toBe(1);
    expect(Math.abs((spouse?.x ?? 0) - (focus?.x ?? 0))).toBe(
      LAYOUT_METRICS.horizontalSpacing
    );
    expect(layout.bounds.width).toBe(layout.width);
    expect(layout.bounds.height).toBe(layout.height);
  });

  it("keeps separate co-parent couples adjacent without interleaving their branches", () => {
    const couplePeople = [
      person("left-father", "male"), person("left-mother", "female"),
      person("right-father", "male"), person("right-mother", "female"),
      person("left-child"), person("right-child")
    ];
    const coupleRelationships = [
      parent("left-father", "left-child"),
      parent("left-mother", "left-child"),
      parent("right-father", "right-child"),
      parent("right-mother", "right-child")
    ];

    const value = createTreeLayout(couplePeople, coupleRelationships);
    const parentRow = value.people
      .filter(({ generation }) => generation === 0)
      .sort((left, right) => left.x - right.x);
    const indexOf = (id: string) => parentRow.findIndex((person) => person.id === id);
    const leftIndices = [indexOf("left-father"), indexOf("left-mother")].sort((a, b) => a - b);
    const rightIndices = [indexOf("right-father"), indexOf("right-mother")].sort((a, b) => a - b);

    expect(leftIndices[1] - leftIndices[0]).toBe(1);
    expect(rightIndices[1] - rightIndices[0]).toBe(1);
    expect(leftIndices[1] < rightIndices[0] || rightIndices[1] < leftIndices[0]).toBe(true);
    expect(createConnectionPlan(value).crossings).toEqual([]);
  });

  it("filters generations around the selected person", () => {
    const ids = ["a2", "a1", "focus", "d1", "d2", "partner"];
    const chainPeople = ids.map((id) => person(id));
    const chainRelationships = [
      parent("a2", "a1"),
      parent("a1", "focus"),
      parent("focus", "d1"),
      parent("d1", "d2"),
      partner("focus", "partner")
    ];
    const limits = { ancestors: 1, descendants: 1 };
    const filtered = filterByGeneration(
      chainPeople,
      chainRelationships,
      "focus",
      limits
    );
    const layout = createTreeLayout(
      chainPeople,
      chainRelationships,
      "focus",
      limits
    );

    expect(new Set(filtered.people.map(({ id }) => id))).toEqual(
      new Set(["a1", "focus", "d1", "partner"])
    );
    expect(new Set(layout.people.map(({ id }) => id))).toEqual(
      new Set(["a1", "focus", "d1", "partner"])
    );
    expect(
      availableGenerationLevels(chainPeople, chainRelationships, "focus")
    ).toEqual({ ancestors: 2, descendants: 2 });
    expect(
      layout.relationships.every(
        ({ fromPersonId, toPersonId }) =>
          layout.people.some(({ id }) => id === fromPersonId) &&
          layout.people.some(({ id }) => id === toPersonId)
      )
    ).toBe(true);
  });

  it("supports hiding every ancestor or descendant generation", () => {
    const ids = ["ancestor", "focus", "partner", "child"];
    const chainPeople = ids.map((id) => person(id));
    const chainRelationships = [
      parent("ancestor", "focus"),
      partner("focus", "partner"),
      parent("focus", "child"),
      parent("partner", "child")
    ];

    const noAncestors = createTreeLayout(
      chainPeople,
      chainRelationships,
      "focus",
      { ancestors: 0, descendants: null }
    );
    expect(new Set(noAncestors.people.map(({ id }) => id))).toEqual(
      new Set(["focus", "partner", "child"])
    );

    const noDescendants = createTreeLayout(
      chainPeople,
      chainRelationships,
      "focus",
      { ancestors: null, descendants: 0 }
    );
    expect(new Set(noDescendants.people.map(({ id }) => id))).toEqual(
      new Set(["ancestor", "focus", "partner"])
    );
  });
});
