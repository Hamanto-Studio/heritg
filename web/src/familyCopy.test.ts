import { describe, expect, it } from "vitest";

import {
  addRelationship,
  copyFocusedTree,
  createInitialAppData,
  createPerson
} from "./domain";
import { selectFocusedFamily } from "./familyCopy";
import type { DirectRole } from "./types";

const buildFamily = () => {
  let data = createInitialAppData("en", {
    id: "tree-a",
    now: "2026-01-01T00:00:00.000Z"
  });
  const names = [
    ["latifa-father", "Latifa father"],
    ["latifa-mother", "Latifa mother"],
    ["latifa", "Latifa"],
    ["latifa-sibling", "Latifa sibling"],
    ["sibling-spouse", "Sibling spouse"],
    ["niece", "Niece"],
    ["robi-father", "Robi father"],
    ["robi-mother", "Robi mother"],
    ["robi", "Robi"],
    ["robi-sibling", "Robi sibling"],
    ["shared-child", "Shared child"],
    ["robi-child", "Robi child"],
    ["grandchild", "Grandchild"],
    ["grandchild-spouse", "Grandchild spouse"],
    ["unrelated", "Unrelated"]
  ] as const;
  for (const [id, displayName] of names) {
    data = createPerson(data, "tree-a", {
      displayName,
      ...(id === "latifa" || id === "robi"
        ? { photoDataUrl: `data:image/jpeg;base64,${id}` }
        : {})
    }, { id, now: "2026-01-02T00:00:00.000Z" });
  }
  const link = (target: string, relative: string, role: DirectRole, id: string) => {
    data = addRelationship(data, target, relative, role, undefined, {
      id,
      now: "2026-01-03T00:00:00.000Z"
    });
  };
  link("latifa", "latifa-father", "father", "latifa-father-link");
  link("latifa", "latifa-mother", "mother", "latifa-mother-link");
  link("latifa-sibling", "latifa-father", "father", "sibling-father-link");
  link("latifa-sibling", "latifa-mother", "mother", "sibling-mother-link");
  link("latifa-sibling", "sibling-spouse", "wife", "sibling-union");
  link("latifa-sibling", "niece", "daughter", "niece-link");
  link("robi", "robi-father", "father", "robi-father-link");
  link("robi", "robi-mother", "mother", "robi-mother-link");
  link("robi-sibling", "robi-father", "father", "robi-sibling-link");
  link("latifa", "robi", "husband", "focus-union");
  link("latifa", "shared-child", "son", "latifa-child-link");
  link("robi", "shared-child", "son", "robi-shared-child-link");
  link("robi", "robi-child", "son", "robi-child-link");
  link("shared-child", "grandchild", "daughter", "grandchild-link");
  link("grandchild", "grandchild-spouse", "husband", "grandchild-union");
  return data;
};

describe("focused family copy selection", () => {
  it("keeps the spouse and marriage while stopping before the spouse's family branch", () => {
    const data = buildFamily();
    const selected = selectFocusedFamily(data.people, data.relationships, "latifa");
    const includedIds = new Set(selected.people.map((person) => person.id));

    expect(includedIds).toEqual(new Set([
      "latifa-father", "latifa-mother", "latifa", "latifa-sibling",
      "sibling-spouse", "niece", "robi", "shared-child", "grandchild", "grandchild-spouse"
    ]));
    expect(selected.excludedPeople.map((person) => person.id)).toEqual([
      "robi-father", "robi-mother", "robi-sibling", "robi-child", "unrelated"
    ]);
    expect(selected.relationships.every((relationship) =>
      includedIds.has(relationship.fromPersonId) && includedIds.has(relationship.toPersonId)
    )).toBe(true);
    expect(selected.relationships.some((relationship) =>
      relationship.fromPersonId === "shared-child" || relationship.toPersonId === "shared-child"
    )).toBe(true);
    expect(selected.relationships.some((relationship) => relationship.id === "focus-union"))
      .toBe(true);
    expect(selected.relationships.some((relationship) => relationship.id === "robi-child-link"))
      .toBe(false);
  });
});

describe("independent focused tree copies", () => {
  it("remaps retained records, selects the copied focus, and leaves the source untouched", () => {
    const source = buildFamily();
    let sequence = 0;
    const result = copyFocusedTree(source, "tree-a", {
      title: "  Latifa Family  ",
      focusPersonId: "latifa"
    }, {
      now: "2026-08-18T00:00:00.000Z",
      idFactory: () => `copy-${sequence++}`
    });
    const copiedTree = result.data.trees.find((tree) => tree.id === result.treeId)!;
    const copiedPeople = result.data.people.filter((person) => person.treeId === result.treeId);
    const copiedRelationships = result.data.relationships.filter(
      (relationship) => relationship.treeId === result.treeId
    );
    const copiedIds = new Set(copiedPeople.map((person) => person.id));

    expect(source.trees).toHaveLength(1);
    expect(source.people).toHaveLength(15);
    expect(result.data.selectedTreeId).toBe(result.treeId);
    expect(copiedTree).toMatchObject({
      title: "Latifa Family",
      createdAt: "2026-08-18T00:00:00.000Z",
      updatedAt: "2026-08-18T00:00:00.000Z"
    });
    expect(copiedPeople).toHaveLength(10);
    expect(copiedPeople.find((person) => person.displayName === "Latifa")?.photoDataUrl)
      .toBe("data:image/jpeg;base64,latifa");
    expect(copiedPeople.find((person) => person.displayName === "Robi")?.photoDataUrl)
      .toBe("data:image/jpeg;base64,robi");
    expect(copiedPeople.some((person) => person.displayName === "Robi father")).toBe(false);
    expect(copiedPeople.some((person) => person.displayName === "Robi child")).toBe(false);
    expect(copiedPeople.every((person) => !source.people.some(({ id }) => id === person.id)))
      .toBe(true);
    expect(copiedIds.has(copiedTree.lastSelectedPersonId!)).toBe(true);
    expect(copiedRelationships.every((relationship) =>
      copiedIds.has(relationship.fromPersonId) && copiedIds.has(relationship.toPersonId)
    )).toBe(true);
    expect(copiedRelationships.some((relationship) => relationship.kind === "partner")).toBe(true);
    expect(result.data.viewports[result.treeId]).toBeUndefined();
  });
});
