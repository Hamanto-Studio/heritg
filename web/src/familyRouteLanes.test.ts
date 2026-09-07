import { describe, expect, it } from "vitest";
import { familyRouteLanes } from "./familyRouteLanes";
import { createTreeLayout } from "./layout";
import { parentPortY } from "./connectionGeometry";
import { createConnectionPlan } from "./connectionPlan";
import { indonesianFamilyFixture } from "./testFixtures/indonesianFamilies";
import { routeClarity } from "./testFixtures/routeClarity";
import type { FamilyRelationship, PositionedPerson } from "./types";

const person = (id: string, x: number, generation: number): PositionedPerson => ({
  id, x, y: generation * 260, generation, role: " ", treeId: "synthetic",
  displayName: id, gender: "unspecified", birthDatePrecision: "year", createdAt: "2026-01-01",
  notes: "", addressLine: "", city: "", province: "", country: "", postalCode: ""
});
const parent = (from: string, to: string): FamilyRelationship => ({
  id: `${from}:${to}`, treeId: "synthetic", fromPersonId: from, toPersonId: to,
  kind: "parent", subtype: "biologicalParent", createdAt: "2026-01-01"
});

describe("household corridor reservations", () => {
  it("gives the central birth stem label space above both additional parent sets", () => {
    const data = indonesianFamilyFixture(10, "shared-parent-sets"), layout = createTreeLayout(data.people, data.relationships);
    const lanes = familyRouteLanes(layout.people, data.relationships);
    const birth = lanes.find((family) => family.parents.some((p) => p.id === data.rootId))!;
    const other = lanes.filter((family) => family.id !== birth.id && family.children.length === birth.children.length);
    expect(other).toHaveLength(2);
    expect(other.every((family) => family.childLaneIndex < birth.childLaneIndex)).toBe(true);
    expect(birth.childStemClearance).toBeGreaterThan(88);
  });
  it("routes converging independent parent sets from the center outward without changing input", () => {
    const people = [person("a", -650, 0), person("b", -390, 0), person("c", -130, 0), person("d", 130, 0),
      person("e", 390, 0), person("f", 650, 0), person("child", 0, 1)];
    const edges = [parent("c", "child"), parent("d", "child"),
      ...["a", "b"].map((id) => ({ ...parent(id, "child"), subtype: "adoptiveParent" as const })),
      ...["e", "f"].map((id) => ({ ...parent(id, "child"), subtype: "fosterParent" as const }))];
    const before = JSON.stringify({ people, edges });
    const lanes = familyRouteLanes(people, edges);
    expect(lanes.find((family) => family.parents.some((p) => p.id === "c"))?.parentLaneIndex).toBe(0);
    expect(lanes.find((family) => family.parents.some((p) => p.id === "a"))?.parentLaneIndex).toBe(1);
    expect(lanes.find((family) => family.parents.some((p) => p.id === "e"))?.parentLaneIndex).toBe(2);
    expect(familyRouteLanes([...people].reverse(), [...edges].reverse())).toEqual(lanes);
    expect(JSON.stringify({ people, edges })).toBe(before);
  });

  it("does not apply converging-set reordering when the parent sets share a person", () => {
    const people = [person("a", -650, 0), person("hub", 0, 0), person("b", 260, 0), person("child", 260, 1)];
    const edges = [parent("a", "child"), parent("hub", "child"),
      ...["hub", "b"].map((id) => ({ ...parent(id, "child"), id: `${id}:adoptive`, subtype: "adoptiveParent" as const }))];
    const lanes = familyRouteLanes(people, edges);
    expect(lanes.find((family) => family.parents.some((p) => p.id === "a"))?.parentLaneIndex).toBe(0);
    expect(lanes.find((family) => family.parents.some((p) => p.id === "b"))?.parentLaneIndex).toBe(1);
  });
  it("separates overlapping child rails, reuses disjoint lanes, and ignores input order", () => {
    const people = [person("a", 0, 0), person("b", 500, 0), person("c", 1500, 0),
      person("a1", 0, 1), person("b1", 260, 1), person("a2", 520, 1), person("b2", 780, 1), person("c1", 1500, 1)];
    const edges = [parent("a", "a1"), parent("a", "a2"), parent("b", "b1"), parent("b", "b2"), parent("c", "c1")];
    const before = JSON.stringify({ people, edges });
    const lanes = familyRouteLanes(people, edges);
    expect(lanes.map((family) => family.childLaneIndex)).toEqual([0, 1, 0]);
    expect(lanes.map((family) => family.parentLaneIndex)).toEqual([0, 1, 0]);
    expect(familyRouteLanes([...people].reverse(), [...edges].reverse()).map(({ id, parentLaneIndex, childLaneIndex }) => ({ id, parentLaneIndex, childLaneIndex })))
      .toEqual(lanes.map(({ id, parentLaneIndex, childLaneIndex }) => ({ id, parentLaneIndex, childLaneIndex })));
    expect(JSON.stringify({ people, edges })).toBe(before);
  });

  it.each(["multiple-wives", "remarried", "adoption", "in-laws", "mixed", "parent-sets"] as const)("reserves usable vertical room for every %s corridor", (scenario) => {
    const data = indonesianFamilyFixture(100, scenario);
    const layout = createTreeLayout(data.people, data.relationships);
    const lanes = familyRouteLanes(layout.people, layout.relationships, layout.familyRailY);
    for (const family of lanes) {
      const parentBottom = Math.max(...family.parents.map((person) => parentPortY({ ...person, role: " " })));
      const childRail = (layout.familyRailY?.[family.id] ?? Math.min(...family.children.map((person) => person.y)) - 32 - 40) - family.childLaneIndex * 32;
      expect(childRail - (parentBottom + 8 + family.parentLaneIndex * 32), family.id).toBeGreaterThanOrEqual(32);
    }
  });

  it.each(["in-laws", "mixed"] as const)("does not merge independent rails in the 100-person %s regression", (scenario) => {
    const data = indonesianFamilyFixture(100, scenario);
    const before = JSON.stringify(data);
    const layout = createTreeLayout(data.people, data.relationships);
    const plan = createConnectionPlan({ ...layout, people: layout.people.map((person) => ({ ...person, role: " " })) }, "id", undefined, false);
    const clarity = routeClarity(layout, plan);
    expect(clarity.unrelatedOverlaps).toBe(0);
    expect(clarity.failures).toBe(0);
    expect(clarity.obstacleHits).toBe(0);
    expect(clarity.missingTerminals).toBe(0);
    expect(clarity.missingParentOrPartnerEdges).toBe(0);
    expect(clarity.disconnectedRoutes).toBe(0);
    expect(clarity.crossings).toBeLessThanOrEqual(scenario === "in-laws" ? 0 : 47);
    expect(JSON.stringify(data)).toBe(before);
  }, 20000);
});
