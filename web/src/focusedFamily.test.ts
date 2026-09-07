import { describe, expect, it } from "vitest";
import { defaultFamilyFocus, focusedFamily, nextFamilyExpansion, sharedParentSiblingIds } from "./focusedFamily";
import type { FamilyRelationship, Person } from "./types";

const people = ["root", "root-partner", "branch", "sibling", "partner", "former", "child", "grandchild", "unrelated"].map((id): Person => ({
  id, treeId: "tree", displayName: id, gender: "unspecified", createdAt: "2026-01-01",
  birthDatePrecision: "year", notes: "", addressLine: "", city: "", province: "", country: "", postalCode: ""
}));
const edge = (from: string, to: string, kind: FamilyRelationship["kind"] = "parent"): FamilyRelationship => ({
  id: `${from}-${to}`, treeId: "tree", fromPersonId: from, toPersonId: to, kind,
  subtype: kind === "parent" ? "biologicalParent" : "spouse", createdAt: "2026-01-01"
});
const relationships = [edge("root", "root-partner", "partner"), edge("root", "branch"), edge("root-partner", "branch"), edge("root", "sibling"), edge("branch", "partner", "partner"), { ...edge("branch", "former", "partner"), subtype: "formerPartner" as const }, edge("branch", "child"), edge("partner", "child"), edge("child", "grandchild")];
const ids = (result: ReturnType<typeof focusedFamily>) => result.people.map((person) => person.id).sort();

describe("focused family viewing window", () => {
  it("optionally includes full and half siblings without expanding their branches", () => {
    const extra = ["full-sibling", "sibling-spouse", "sibling-child", "cousin", "step-sibling"].map((id) => ({ ...people[0], id, displayName: id }));
    const allPeople = [...people, ...extra];
    const edges = [...relationships,
      edge("root", "full-sibling"), edge("root-partner", "full-sibling"),
      edge("sibling", "sibling-spouse", "partner"), edge("sibling", "sibling-child"),
      edge("unrelated", "cousin"), { ...edge("branch", "step-sibling", "sibling"), subtype: "stepSibling" as const },
      edge("missing-parent", "branch"), edge("missing-parent", "unrelated"), edge("root", "missing-child")
    ];
    const focus = { personId: "branch", ancestors: 1, descendants: 1 };
    const before = JSON.stringify({ allPeople, edges });
    expect([...sharedParentSiblingIds(allPeople, edges, "branch")].sort()).toEqual(["full-sibling", "sibling"]);
    const result = focusedFamily(allPeople, edges, { ...focus, siblings: true });
    expect(ids(result)).toEqual([...ids(focusedFamily(allPeople, edges, focus)), "full-sibling", "sibling"].sort());
    expect(result.relationships.some((edge) => edge.fromPersonId === "root" && edge.toPersonId === "sibling")).toBe(true);
    expect(ids(focusedFamily(allPeople, edges, { ...focus, siblings: false }))).not.toContain("sibling");
    expect(nextFamilyExpansion(allPeople, edges, { ...focus, siblings: true }, "descendants")?.siblings).toBe(true);
    expect(JSON.stringify({ allPeople, edges })).toBe(before);
  });

  it("keeps parents, partners, former partners and children without pulling in sibling branches", () => {
    const result = focusedFamily(people, relationships, { personId: "branch", ancestors: 1, descendants: 1 });
    expect(ids(result)).toEqual(["branch", "child", "former", "partner", "root", "root-partner"]);
    expect(result.relationships.every((edge) => ids(result).includes(edge.fromPersonId) && ids(result).includes(edge.toPersonId))).toBe(true);
    expect(people).toHaveLength(9);
    expect(relationships).toHaveLength(9);
  });
  it("expands generations without bringing unrelated people into view", () => {
    expect(ids(focusedFamily(people, relationships, { personId: "branch", ancestors: 1, descendants: 2 }))).toContain("grandchild");
    expect(ids(focusedFamily(people, relationships, { personId: "branch", ancestors: 0, descendants: 0 }))).toEqual(["branch", "former", "partner"]);
  });
  it("shows co-parents without requiring a marriage edge", () => {
    const result = focusedFamily(people, relationships.filter((edge) => edge.kind === "parent"), { personId: "branch", ancestors: 0, descendants: 1 });
    expect(ids(result)).toEqual(["branch", "child", "partner"]);
  });
  it("handles cycles and dangling edges, and falls back for a removed focus", () => {
    const result = focusedFamily(people, [...relationships, edge("grandchild", "branch"), edge("missing", "child")], { personId: "branch", ancestors: 99, descendants: 99 });
    expect(result.people.length).toBeLessThanOrEqual(people.length);
    expect(result.relationships.some((edge) => edge.fromPersonId === "missing")).toBe(false);
    expect(focusedFamily(people, relationships, { personId: "missing", ancestors: 1, descendants: 1 }).people).toBe(people);
    expect(focusedFamily(people, relationships).people).toBe(people);
  });
  it("starts in a branch deterministically, and supports empty and isolated trees", () => {
    expect(defaultFamilyFocus(people, relationships)).toBe("branch");
    expect(defaultFamilyFocus([...people].reverse(), [...relationships].reverse())).toBe("branch");
    expect(defaultFamilyFocus([], [])).toBeUndefined();
    expect(focusedFamily([people[0]], [], { personId: "root", ancestors: 1, descendants: 1 }).people).toEqual([people[0]]);
  });
  it("offers expansion only when the focused branch has more people to reveal", () => {
    const focus = { personId: "branch", ancestors: 1, descendants: 1 };
    expect(nextFamilyExpansion(people, relationships, focus, "ancestors")).toBeUndefined();
    expect(nextFamilyExpansion(people, relationships, focus, "descendants")?.descendants).toBe(2);
    const partnerOnly = [edge("branch", "partner", "partner"), edge("root", "partner"), edge("partner", "child")];
    expect(nextFamilyExpansion(people, partnerOnly, focus, "ancestors")).toBeUndefined();
    expect(nextFamilyExpansion(people, partnerOnly, focus, "descendants")).toBeUndefined();
  });
});
