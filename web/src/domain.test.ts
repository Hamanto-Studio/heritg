import { describe, expect, it } from "vitest";

import {
  DomainError,
  addRelationship,
  createInitialAppData,
  createPerson,
  createTree,
  deletePerson,
  deleteTree,
  directRoleDefaults,
  relationshipEndpoints,
  renameTree,
  replaceAppData,
  selectPerson,
  setViewport,
  updatePerson
} from "./domain";
import {
  ROLE_GROUPS,
  allowsCoParent,
  isPartnerRole,
  roleForRelationship
} from "./relationshipRoles";
import type {
  AppData,
  DirectRole,
  Gender,
  RelationshipKind,
  RelationshipSubtype
} from "./types";

const initial = () =>
  createInitialAppData("en", {
    id: "tree-a",
    now: "2026-01-01T00:00:00.000Z"
  });

const withPerson = (
  data: AppData,
  treeId: string,
  id: string,
  displayName: string,
  now = "2026-01-02T00:00:00.000Z"
) => createPerson(data, treeId, { displayName }, { id, now });

describe("initial app data", () => {
  it("creates one selected empty localized tree", () => {
    const english = initial();
    const indonesian = createInitialAppData("id", {
      id: "tree-id",
      now: "2026-01-01T00:00:00.000Z"
    });

    expect(english.trees).toEqual([
      {
        id: "tree-a",
        title: "My Family Tree",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    ]);
    expect(english.selectedTreeId).toBe("tree-a");
    expect(english.people).toEqual([]);
    expect(english.relationships).toEqual([]);
    expect(indonesian.trees[0].title).toBe("Silsilah Keluarga Saya");
  });
});

describe("direct relationship roles", () => {
  const cases: Array<
    [DirectRole, Gender, RelationshipKind, RelationshipSubtype, boolean]
  > = [
    ["father", "male", "parent", "biologicalParent", true],
    ["mother", "female", "parent", "biologicalParent", true],
    ["son", "male", "parent", "biologicalParent", false],
    ["daughter", "female", "parent", "biologicalParent", false],
    ["adoptiveFather", "male", "parent", "adoptiveParent", true],
    ["adoptiveMother", "female", "parent", "adoptiveParent", true],
    ["adoptiveSon", "male", "parent", "adoptiveParent", false],
    ["adoptiveDaughter", "female", "parent", "adoptiveParent", false],
    ["fosterFather", "male", "parent", "fosterParent", true],
    ["fosterMother", "female", "parent", "fosterParent", true],
    ["fosterSon", "male", "parent", "fosterParent", false],
    ["fosterDaughter", "female", "parent", "fosterParent", false],
    ["guardian", "unspecified", "parent", "guardian", true],
    ["ward", "unspecified", "parent", "guardian", false],
    ["stepfather", "male", "parent", "stepParent", true],
    ["stepmother", "female", "parent", "stepParent", true],
    ["stepson", "male", "parent", "stepParent", false],
    ["stepdaughter", "female", "parent", "stepParent", false],
    ["brother", "male", "sibling", "sibling", false],
    ["sister", "female", "sibling", "sibling", false],
    ["halfBrother", "male", "sibling", "halfSibling", false],
    ["halfSister", "female", "sibling", "halfSibling", false],
    ["adoptiveBrother", "male", "sibling", "adoptiveSibling", false],
    ["adoptiveSister", "female", "sibling", "adoptiveSibling", false],
    ["fosterBrother", "male", "sibling", "fosterSibling", false],
    ["fosterSister", "female", "sibling", "fosterSibling", false],
    ["stepbrother", "male", "sibling", "stepSibling", false],
    ["stepsister", "female", "sibling", "stepSibling", false],
    ["partner", "unspecified", "partner", "partner", false],
    ["husband", "male", "partner", "spouse", false],
    ["wife", "female", "partner", "spouse", false],
    ["formerPartner", "unspecified", "partner", "formerPartner", false],
    ["formerHusband", "male", "partner", "formerSpouse", false],
    ["formerWife", "female", "partner", "formerSpouse", false]
  ];

  it.each(cases)(
    "maps %s to its gender, direction, and subtype",
    (role, gender, kind, subtype, relativeIsParent) => {
      expect(directRoleDefaults(role)).toEqual({ gender, kind, subtype, relativeIsParent });
    }
  );

  it("keeps sibling roles out of the visible relationship groups", () => {
    expect(ROLE_GROUPS.map((group) => group.id)).toEqual([
      "common", "parents", "partners", "children"
    ]);
    expect(ROLE_GROUPS[0].roles).toEqual([
      "father", "mother", "son", "daughter", "wife", "husband"
    ]);
    const groupedRoles = ROLE_GROUPS.flatMap((group) => group.roles);
    const visibleRoles = cases
      .filter(([, , kind]) => kind !== "sibling")
      .map(([role]) => role);
    expect(groupedRoles).toHaveLength(visibleRoles.length);
    expect(new Set(groupedRoles).size).toBe(groupedRoles.length);
    expect(new Set(groupedRoles)).toEqual(new Set(visibleRoles));
  });

  it("limits co-parenting to non-step child roles and dates to union roles", () => {
    const coParentRoles = cases
      .map(([role]) => role)
      .filter(allowsCoParent);
    expect(coParentRoles).toEqual([
      "son", "daughter", "adoptiveSon", "adoptiveDaughter",
      "fosterSon", "fosterDaughter", "ward"
    ]);
    expect(cases.map(([role]) => role).filter(isPartnerRole)).toEqual([
      "partner", "husband", "wife", "formerPartner", "formerHusband", "formerWife"
    ]);
  });

  it("directs parent links and canonicalizes partner and sibling endpoints", () => {
    expect(relationshipEndpoints("focus", "relative", "father")).toMatchObject({
      fromPersonId: "relative",
      toPersonId: "focus"
    });
    expect(relationshipEndpoints("focus", "relative", "adoptiveDaughter")).toMatchObject({
      fromPersonId: "focus",
      toPersonId: "relative",
      subtype: "adoptiveParent"
    });
    expect(relationshipEndpoints("z-person", "a-relative", "wife")).toMatchObject({
      fromPersonId: "a-relative",
      toPersonId: "z-person",
      subtype: "spouse"
    });
    expect(relationshipEndpoints("z-person", "a-relative", "halfBrother")).toMatchObject({
      fromPersonId: "a-relative",
      toPersonId: "z-person",
      subtype: "halfSibling"
    });
  });

  it("uses the role gender when creating a new relative", () => {
    const data = createPerson(
      initial(),
      "tree-a",
      { displayName: "Daughter", role: "daughter" },
      { id: "daughter", now: "2026-01-02T00:00:00.000Z" }
    );
    expect(data.people[0].gender).toBe("female");
  });

  it("preselects directed, symmetric, and gendered editor roles", () => {
    const relation = (
      role: DirectRole,
      gender: Gender,
      targetId = "focus",
      relativeId = "relative"
    ) => {
      let data = withPerson(initial(), "tree-a", targetId, "Focus");
      data = createPerson(data, "tree-a", { displayName: "Relative", gender }, {
        id: relativeId,
        now: "2026-01-03T00:00:00.000Z"
      });
      data = addRelationship(data, targetId, relativeId, role, undefined, {
        id: `relationship-${role}`
      });
      return { relationship: data.relationships[0], relative: data.people[1] };
    };

    const parent = relation("adoptiveMother", "female");
    expect(roleForRelationship(parent.relationship, "focus", parent.relative))
      .toBe("adoptiveMother");
    const child = relation("fosterDaughter", "female");
    expect(roleForRelationship(child.relationship, "focus", child.relative))
      .toBe("fosterDaughter");
    const formerSpouse = relation("formerWife", "female");
    expect(roleForRelationship(formerSpouse.relationship, "focus", formerSpouse.relative))
      .toBe("formerWife");
    const sibling = relation("stepbrother", "male");
    expect(roleForRelationship(sibling.relationship, "focus", sibling.relative))
      .toBe("stepbrother");
  });
});

describe("immutable state transitions", () => {
  it("renames without mutating the source and maintains updatedAt", () => {
    const source = initial();
    const renamed = renameTree(
      source,
      "tree-a",
      "  The Family  ",
      "2026-02-01T00:00:00.000Z"
    );

    expect(source.trees[0].title).toBe("My Family Tree");
    expect(renamed.trees[0]).toMatchObject({
      title: "The Family",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z"
    });
  });

  it("updates person fields immutably and touches their tree", () => {
    const source = withPerson(initial(), "tree-a", "person-a", "Before");
    const updated = updatePerson(
      source,
      "person-a",
      { displayName: "  After  ", city: "  Jakarta  " },
      "2026-03-01T00:00:00.000Z"
    );

    expect(source.people[0]).toMatchObject({ displayName: "Before", city: "" });
    expect(updated.people[0]).toMatchObject({
      displayName: "After",
      city: "Jakarta"
    });
    expect(updated.trees[0].updatedAt).toBe("2026-03-01T00:00:00.000Z");
  });

  it("creates, updates, and clears a manual child order", () => {
    const source = createPerson(
      initial(),
      "tree-a",
      { displayName: "Child", birthOrderOverride: 2 },
      { id: "child", now: "2026-01-02T00:00:00.000Z" }
    );
    expect(source.people[0].birthOrderOverride).toBe(2);
    expect(updatePerson(source, "child", { birthOrderOverride: 3 }).people[0].birthOrderOverride)
      .toBe(3);
    expect(updatePerson(source, "child", { birthOrderOverride: undefined }).people[0])
      .not.toHaveProperty("birthOrderOverride", expect.any(Number));
  });

  it("rejects invalid manual child orders", () => {
    expect(() => createPerson(initial(), "tree-a", {
      displayName: "Child",
      birthOrderOverride: 0
    })).toThrow(/positive whole number/i);

    const source = withPerson(initial(), "tree-a", "child", "Child");
    expect(() => updatePerson(source, "child", { birthOrderOverride: 1.5 }))
      .toThrow(/positive whole number/i);
  });

  it("deletes a tree and all of its scoped data", () => {
    let data = withPerson(initial(), "tree-a", "person-a", "A");
    data = setViewport(data, "tree-a", { scrollX: 10, scrollY: 20, zoom: 1.5 });
    data = createTree(data, "Other", {
      id: "tree-b",
      now: "2026-01-03T00:00:00.000Z"
    });
    data = withPerson(data, "tree-b", "person-b", "B");
    data = setViewport(data, "tree-b", { scrollX: 30, scrollY: 40, zoom: 2 });
    const deleted = deleteTree(data, "tree-b");

    expect(deleted.trees.map((tree) => tree.id)).toEqual(["tree-a"]);
    expect(deleted.selectedTreeId).toBe("tree-a");
    expect(deleted.people.map((person) => person.id)).toEqual(["person-a"]);
    expect(deleted.viewports["tree-a"]).toBeDefined();
    expect(deleted.viewports["tree-b"]).toBeUndefined();
  });
});

describe("relationship validation", () => {
  const family = () => {
    let data = withPerson(initial(), "tree-a", "child", "Child");
    data = withPerson(data, "tree-a", "father", "Father");
    return data;
  };

  it("creates directed relationships and rejects duplicates", () => {
    const source = family();
    const linked = addRelationship(source, "child", "father", "father", undefined, {
      id: "relationship-a",
      now: "2026-04-01T00:00:00.000Z"
    });

    expect(source.relationships).toEqual([]);
    expect(linked.relationships[0]).toMatchObject({
      treeId: "tree-a",
      fromPersonId: "father",
      toPersonId: "child",
      kind: "parent",
      subtype: "biologicalParent"
    });
    expect(linked.trees[0].updatedAt).toBe("2026-04-01T00:00:00.000Z");
    expect(() =>
      addRelationship(linked, "child", "father", "father")
    ).toThrowError(new DomainError("duplicateRelationship"));
  });

  it("rejects self and cross-tree relationships", () => {
    let data = family();
    data = createTree(data, "Other", { id: "tree-b" });
    data = withPerson(data, "tree-b", "other", "Other");

    expect(() => addRelationship(data, "child", "child", "partner")).toThrowError(
      new DomainError("selfRelationship")
    );
    expect(() => addRelationship(data, "child", "other", "partner")).toThrowError(
      new DomainError("crossTreeRelationship")
    );
  });

  it("treats a reversed partner link as a duplicate", () => {
    let data = family();
    data = addRelationship(data, "child", "father", "partner", undefined, {
      id: "partners"
    });
    expect(() => addRelationship(data, "father", "child", "partner")).toThrowError(
      new DomainError("duplicateRelationship")
    );
  });

  it("stores divorce dates only for former unions and validates their chronology", () => {
    let data = family();
    data = addRelationship(data, "child", "father", "formerHusband", "2000-01-02", {
      id: "former-spouses"
    }, "2010-03-04");
    data = addRelationship(data, "child", "father", "fosterBrother", "2001-02-03", {
      id: "foster-siblings"
    }, "2011-04-05");

    expect(data.relationships[0].marriageDate).toBe("2000-01-02");
    expect(data.relationships[0].divorceDate).toBe("2010-03-04");
    expect(data.relationships[1]).not.toHaveProperty("marriageDate");
    expect(data.relationships[1]).not.toHaveProperty("divorceDate");

    const active = addRelationship(family(), "child", "father", "wife", "2000-01-02", {
      id: "active-spouses"
    }, "2010-03-04");
    expect(active.relationships[0]).not.toHaveProperty("divorceDate");

    expect(() => addRelationship(
      family(), "child", "father", "formerPartner", "2010-01-02",
      { id: "invalid-order" }, "2009-12-31"
    )).toThrow(/earlier than marriage/i);
    expect(() => addRelationship(
      family(), "child", "father", "formerPartner", undefined,
      { id: "invalid-format" }, "2010-2-03"
    )).toThrow(/YYYY-MM-DD/i);
  });
});

describe("person selection and deletion", () => {
  it("removes incident links and selects a remaining fallback", () => {
    let data = withPerson(initial(), "tree-a", "person-a", "A");
    data = withPerson(data, "tree-a", "person-b", "B");
    data = addRelationship(data, "person-a", "person-b", "partner", undefined, {
      id: "relationship-a"
    });
    data = selectPerson(data, "person-a");
    const deleted = deletePerson(data, "person-a", "2026-05-01T00:00:00.000Z");

    expect(deleted.people.map((person) => person.id)).toEqual(["person-b"]);
    expect(deleted.relationships).toEqual([]);
    expect(deleted.trees[0].lastSelectedPersonId).toBe("person-b");
    expect(deleted.trees[0].updatedAt).toBe("2026-05-01T00:00:00.000Z");
  });
});

describe("import replacement", () => {
  it("validates and clones replacement data", () => {
    const source = initial();
    const replacement = replaceAppData(source);
    replacement.trees[0].title = "Changed clone";
    expect(source.trees[0].title).toBe("My Family Tree");
  });

  it("rejects dangling and duplicate relationship data", () => {
    const source = familyWithRelationship();
    const invalid: AppData = {
      ...source,
      relationships: [
        source.relationships[0],
        { ...source.relationships[0], id: "another-id" }
      ]
    };
    expect(() => replaceAppData(invalid)).toThrowError(DomainError);
  });

  it("rejects a subtype that does not belong to its relationship kind", () => {
    const source = familyWithRelationship();
    const invalid: AppData = {
      ...source,
      relationships: [{ ...source.relationships[0], subtype: "biologicalParent" }]
    };
    expect(() => replaceAppData(invalid)).toThrowError(DomainError);
  });

  it("rejects malformed person enum fields", () => {
    const source = withPerson(initial(), "tree-a", "person-a", "A");
    const invalid = {
      ...source,
      people: [{ ...source.people[0], gender: "invalid" }]
    };
    expect(() => replaceAppData(invalid)).toThrowError(DomainError);
  });

  it("rejects malformed manual child order values", () => {
    const source = withPerson(initial(), "tree-a", "person-a", "A");
    const invalid = {
      ...source,
      people: [{ ...source.people[0], birthOrderOverride: -1 }]
    };
    expect(() => replaceAppData(invalid)).toThrowError(DomainError);
  });
});

function familyWithRelationship() {
  let data = withPerson(initial(), "tree-a", "person-a", "A");
  data = withPerson(data, "tree-a", "person-b", "B");
  return addRelationship(data, "person-a", "person-b", "partner", undefined, {
    id: "relationship-a"
  });
}
