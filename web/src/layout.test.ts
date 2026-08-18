import { describe, expect, it } from "vitest";
import { createConnectionPlan } from "./connectionPlan";
import { directRelationshipLabel, kinshipLabel } from "./kinship";
import {
  LAYOUT_METRICS,
  availableGenerationLevels,
  createTreeLayout,
  filterByGeneration,
  getGenerationMap
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

    expect(kinshipLabel("focus", "focus", people, relationships)).toBe("Selected person");
    expect(kinshipLabel("focus", "focus", people, relationships, "id")).toBe("Orang terpilih");
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

  it("uses regional Javanese seniority and cousin terminology", () => {
    const people = [
      person("grandparent"),
      person("older-aunt", "female", "1960-01-01"),
      person("father", "male", "1965-01-01"),
      person("cousin", "male", "1988-01-01"),
      person("older-sister", "female", "1989-01-01"),
      person("focus", "male", "1990-01-01")
    ];
    const relationships = [
      parent("grandparent", "older-aunt"),
      parent("grandparent", "father"),
      parent("older-aunt", "cousin"),
      parent("father", "older-sister"),
      parent("father", "focus")
    ];

    expect(kinshipLabel("father", "focus", people, relationships, "jv-yogyakarta"))
      .toBe("Bapak");
    expect(kinshipLabel("older-aunt", "focus", people, relationships, "jv-yogyakarta"))
      .toBe("Bu Dhe");
    expect(kinshipLabel("older-sister", "focus", people, relationships, "jv-yogyakarta"))
      .toBe("Mbakyu");
    expect(kinshipLabel("older-sister", "focus", people, relationships, "jv-east-java"))
      .toBe("Mbak");
    expect(kinshipLabel("cousin", "focus", people, relationships, "jv-yogyakarta"))
      .toBe("Nak-sanak");
    expect(kinshipLabel("cousin", "focus", people, relationships, "jv-east-java"))
      .toBe("Misanan");
  });

  it("prefers manual birth order when resolving Javanese sibling seniority", () => {
    const people = [
      { ...person("parent"), birthDate: undefined },
      { ...person("focus", "male"), birthDate: undefined, birthOrderOverride: 2 },
      { ...person("sibling", "male"), birthDate: undefined, birthOrderOverride: 1 }
    ];
    const relationships = [parent("parent", "focus"), parent("parent", "sibling")];

    expect(kinshipLabel("sibling", "focus", people, relationships, "jv-yogyakarta"))
      .toBe("Kangmas");
    expect(kinshipLabel("sibling", "focus", people, relationships, "jv-east-java"))
      .toBe("Mas");
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
    expect(layout.people[0].role).toBe("");
  });

  it("shows kinship roles only while a person is selected", () => {
    const values = [person("parent", "male"), person("focus")];
    const relationships = [parent("parent", "focus")];
    const unselected = createTreeLayout(values, relationships);
    const selected = createTreeLayout(values, relationships, "focus");

    expect(unselected.people.every(({ role }) => role === "")).toBe(true);
    expect(selected.people.find(({ id }) => id === "focus")?.role).toBe("Selected person");
    expect(selected.people.find(({ id }) => id === "parent")?.role).toBe("Father");
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

  it("compacts a shallow ancestry branch when partners merge at a deeper generation", () => {
    const branchPeople = [
      person("deep-grandparent"), person("deep-parent"), person("deep-partner"),
      person("shallow-parent"), person("shallow-partner")
    ];
    const branchRelationships = [
      parent("deep-grandparent", "deep-parent"),
      parent("deep-parent", "deep-partner"),
      parent("shallow-parent", "shallow-partner"),
      partner("deep-partner", "shallow-partner", "merged-partnership")
    ];
    const generations = getGenerationMap(branchPeople, branchRelationships);

    expect(generations["deep-grandparent"]).toBe(0);
    expect(generations["deep-parent"]).toBe(1);
    expect(generations["shallow-parent"]).toBe(1);
    expect(generations["deep-partner"]).toBe(2);
    expect(generations["shallow-partner"]).toBe(2);
    expect(getGenerationMap(
      [...branchPeople].reverse(),
      [...branchRelationships].reverse()
    )).toEqual(generations);
  });

  it("keeps an older married child on the same row and left of younger siblings", () => {
    const familyPeople = [
      person("spouse-grandfather"), person("spouse-grandmother"),
      person("spouse-father"), person("spouse-mother"),
      person("father"), person("mother"),
      person("older-child", "male", "1961-06-27"),
      person("older-child-spouse", "female", "1970-01-15"),
      person("younger-child", "male", "1978-08-01")
    ];
    const familyRelationships = [
      parent("spouse-grandfather", "spouse-father"),
      parent("spouse-grandmother", "spouse-father"),
      parent("spouse-father", "older-child-spouse"),
      parent("spouse-mother", "older-child-spouse"),
      parent("father", "older-child"),
      parent("mother", "older-child"),
      parent("father", "younger-child"),
      parent("mother", "younger-child"),
      partner("older-child", "older-child-spouse", "older-child-partnership")
    ];

    const layout = createTreeLayout(familyPeople, familyRelationships);
    const positioned = new Map(layout.people.map((value) => [value.id, value]));
    const older = positioned.get("older-child")!;
    const spouse = positioned.get("older-child-spouse")!;
    const younger = positioned.get("younger-child")!;

    expect(older.generation).toBe(younger.generation);
    expect(spouse.generation).toBe(older.generation);
    expect(older.x).toBeLessThan(younger.x);
    expect(Math.abs(older.x - spouse.x)).toBe(LAYOUT_METRICS.horizontalSpacing);
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
    const positioned = new Map(value.people.map((person) => [person.id, person]));
    const parentCenter = (firstId: string, secondId: string) =>
      ((positioned.get(firstId)?.x ?? 0) + (positioned.get(secondId)?.x ?? 0)) / 2;
    expect(positioned.get("left-child")?.x).toBe(parentCenter("left-father", "left-mother"));
    expect(positioned.get("right-child")?.x).toBe(parentCenter("right-father", "right-mother"));
    expect(createConnectionPlan(value).crossings).toEqual([]);
  });

  it("adds extra horizontal space between children from different families", () => {
    const familyPeople = [
      person("left-father", "male"), person("left-mother", "female"),
      person("right-father", "male"), person("right-mother", "female"),
      person("left-child-a"), person("left-child-b"),
      person("right-child-a"), person("right-child-b")
    ];
    const familyRelationships = [
      parent("left-father", "left-child-a"),
      parent("left-mother", "left-child-a"),
      parent("left-father", "left-child-b"),
      parent("left-mother", "left-child-b"),
      parent("right-father", "right-child-a"),
      parent("right-mother", "right-child-a"),
      parent("right-father", "right-child-b"),
      parent("right-mother", "right-child-b")
    ];

    const row = createTreeLayout(familyPeople, familyRelationships).people
      .filter(({ generation }) => generation === 1)
      .sort((left, right) => left.x - right.x);
    const gaps = row.slice(1).map((person, index) => person.x - row[index].x);

    expect(gaps).toEqual([
      LAYOUT_METRICS.horizontalSpacing,
      LAYOUT_METRICS.horizontalSpacing + LAYOUT_METRICS.familyGap,
      LAYOUT_METRICS.horizontalSpacing
    ]);
  });

  it("adds extra horizontal space between a married child and their siblings", () => {
    const familyPeople = [
      person("father", "male"), person("mother", "female"),
      person("married-child"), person("spouse"), person("single-child")
    ];
    const familyRelationships = [
      parent("father", "married-child"),
      parent("mother", "married-child"),
      parent("father", "single-child"),
      parent("mother", "single-child"),
      partner("married-child", "spouse")
    ];

    const row = createTreeLayout(familyPeople, familyRelationships).people
      .filter(({ generation }) => generation === 1)
      .sort((left, right) => left.x - right.x);
    const gaps = row.slice(1).map((person, index) => person.x - row[index].x);

    expect(gaps.sort((left, right) => left - right)).toEqual([
      LAYOUT_METRICS.horizontalSpacing,
      LAYOUT_METRICS.horizontalSpacing + LAYOUT_METRICS.familyGap
    ]);
  });

  it("keeps an independent spouse pair together inside a shared co-parent row", () => {
    const familyPeople = [
      person("adoptive-father", "male"), person("adoptive-father-wife", "female"),
      person("stepfather", "male"), person("mother", "female"),
      person("father", "male"), person("child", "female")
    ];
    const familyRelationships = [
      partner("adoptive-father", "adoptive-father-wife", "adoptive-union"),
      partner("stepfather", "mother", "step-union"),
      partner("father", "mother", "parent-union"),
      parent("adoptive-father", "child", "adoptive-parent", "adoptiveParent"),
      parent("stepfather", "child", "step-parent", "stepParent"),
      parent("mother", "child"),
      parent("father", "child")
    ];
    const coordinates = (people: typeof familyPeople, edges: typeof familyRelationships) =>
      Object.fromEntries(createTreeLayout(people, edges).people.map(({ id, x }) => [id, x]));

    const first = coordinates(familyPeople, familyRelationships);
    const second = coordinates([...familyPeople].reverse(), [...familyRelationships].reverse());

    expect(second).toEqual(first);
    expect(Math.abs(first["adoptive-father"] - first["adoptive-father-wife"]))
      .toBe(LAYOUT_METRICS.horizontalSpacing);
    expect(Math.abs(first.stepfather - first.mother)).toBe(LAYOUT_METRICS.horizontalSpacing);
    expect(Math.abs(first.father - first.mother)).toBe(LAYOUT_METRICS.horizontalSpacing);
  });

  it("expands descendant families from their parent anchors without recentering the row", () => {
    const branchPeople = [
      person("left-parent-a"), person("left-parent-b"),
      person("right-parent-a"), person("right-parent-b"),
      person("left-child"), person("left-partner-a"), person("left-partner-b"),
      person("right-child"), person("right-spouse")
    ];
    const branchRelationships = [
      parent("left-parent-a", "left-child"),
      parent("left-parent-b", "left-child"),
      partner("left-child", "left-partner-a", "left-partnership-a"),
      partner("left-child", "left-partner-b", "left-partnership-b"),
      parent("right-parent-a", "right-child"),
      parent("right-parent-b", "right-child"),
      partner("right-child", "right-spouse", "right-partnership")
    ];
    const coordinates = (values: typeof branchPeople, edges: typeof branchRelationships) =>
      Object.fromEntries(createTreeLayout(values, edges).people.map(({ id, x }) => [id, x]));

    const first = coordinates(branchPeople, branchRelationships);
    const second = coordinates([...branchPeople].reverse(), [...branchRelationships].reverse());

    expect(second).toEqual(first);
    expect(first["left-child"]).toBe((first["left-parent-a"] + first["left-parent-b"]) / 2);
    expect(first["right-child"]).toBe((first["right-parent-a"] + first["right-parent-b"]) / 2);
    const leftPartnerPositions = [first["left-partner-a"], first["left-partner-b"]]
      .sort((left, right) => left - right);
    expect(leftPartnerPositions[0]).toBe(first["left-child"] - LAYOUT_METRICS.horizontalSpacing);
    expect(leftPartnerPositions[1]).toBe(first["left-child"] + LAYOUT_METRICS.horizontalSpacing);
    expect(Math.abs(first["right-spouse"] - first["right-child"])).toBe(
      LAYOUT_METRICS.horizontalSpacing
    );
    expect(Math.max(...leftPartnerPositions, first["left-child"])).toBeLessThan(
      Math.min(first["right-child"], first["right-spouse"])
    );
  });

  it("orders couples on the same side as their own parents", () => {
    const branchPeople = [
      person("left-parent-a"), person("left-parent-b"),
      person("right-parent-a"), person("right-parent-b"),
      person("z-left-child"), person("a-right-child")
    ];
    const branchRelationships = [
      parent("left-parent-a", "z-left-child"),
      parent("left-parent-b", "z-left-child"),
      parent("right-parent-a", "a-right-child"),
      parent("right-parent-b", "a-right-child"),
      partner("z-left-child", "a-right-child", "child-partnership")
    ];

    const value = createTreeLayout(branchPeople, branchRelationships);
    const positioned = new Map(value.people.map((person) => [person.id, person]));

    expect(positioned.get("z-left-child")?.x).toBeLessThan(
      positioned.get("a-right-child")?.x ?? Number.NEGATIVE_INFINITY
    );
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
