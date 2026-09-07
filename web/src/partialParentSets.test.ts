import { describe, expect, it } from "vitest";
import { indonesianFamilyFixture } from "./testFixtures/indonesianFamilies";
import { routeClarity } from "./testFixtures/routeClarity";
import { prepareTree } from "./treePreparation";
import { createTreeLayout } from "./layout";
import { createConnectionPlan } from "./connectionPlan";
import { sharedAncestryCorridors } from "./sharedAncestryCorridors";
import { parentConnectionGroups } from "./parentConnections";
import { completeTreeRouting } from "./fullTreeRouting";
import { visibleConnectionPlan } from "./visibleConnectionPlan";
import { focusedFamily } from "./focusedFamily";
import { buildChartSvg } from "./chartExport";

const integrity = { missingParentOrPartnerEdges: 0, missingTerminals: 0, disconnectedRoutes: 0,
  diagonalSegments: 0, obstacleHits: 0, personOverlaps: 0, reversedParentDirections: 0,
  conflatedParentSets: 0, unlabeledParentTypes: 0, unlabeledCareLabels: 0, unrelatedOverlaps: 0, failures: 0 };
const reserved = (data: ReturnType<typeof indonesianFamilyFixture>) => {
  const layout = createTreeLayout(data.people, data.relationships);
  return { ...layout, people: layout.people.map((person) => ({ ...person, role: " " })) };
};

describe("overlapping sibling histories without invented relationships", () => {
  it.each([100, 250, 500])("retains all %i people with zero crossings through actual Full preparation", (size) => {
    const data = indonesianFamilyFixture(size, "partial-parent-sets"), before = JSON.stringify(data);
    const result = prepareTree({ ...data, requestKey: "partial-parent-sets", layoutMode: "full",
      generationLimits: { ancestors: null, descendants: null }, language: "id", relationshipLanguage: "id", controlsVisible: false });
    const layout = { ...result.geometryLayout, people: result.geometryLayout.people.map((person) => ({ ...person, role: " " })) };
    expect(routeClarity(layout, result.connectionPlan)).toMatchObject({ ...integrity, crossings: 0,
      people: size, relationships: data.relationships.length });
    expect(completeTreeRouting(layout, result.connectionPlan)).toBe(true);
    expect(new Set(layout.people.map((person) => person.id)).size).toBe(size);
    expect(layout.relationships).toEqual(reserved(data).relationships);
    for (const group of parentConnectionGroups(data.relationships)) {
      const family = result.connectionPlan.families.find((candidate) => candidate.id === group.id)!;
      expect(family).toBeDefined();
      expect(family.parentIds).toEqual(group.parentIds);
      expect(family.childIds).toEqual(group.childIds);
      expect([...family.relationshipIds].sort()).toEqual(group.relationships.map((edge) => edge.id).sort());
    }
    expect(routeClarity(layout, visibleConnectionPlan(result.connectionPlan, layout, "id")))
      .toMatchObject({ ...integrity, crossings: 0 });
    expect(JSON.stringify(data)).toBe(before);
  }, 60000);

  it.each([0, 1, 2])("orders partial memberships independently of renamed/reversed IDs (%i)", (shift) => {
    const data = indonesianFamilyFixture(28, "partial-parent-sets", shift);
    const renamed = new Map(data.people.map((person, index) => [person.id,
      `person-${String((index * 11 + shift) % data.people.length).padStart(3, "0")}`]));
    data.people = data.people.map((person) => ({ ...person, id: renamed.get(person.id)! })).reverse();
    data.relationships = data.relationships.map((edge, index) => ({ ...edge, id: `record-${1000 - index}`,
      fromPersonId: renamed.get(edge.fromPersonId)!, toPersonId: renamed.get(edge.toPersonId)! })).reverse();
    const raw = reserved(data), before = JSON.stringify(raw), candidate = sharedAncestryCorridors(raw)!;
    expect(candidate).toBeDefined();
    for (const language of ["en", "id"] as const) {
      const plan = createConnectionPlan(candidate, language, undefined, true);
      expect(routeClarity(candidate, plan)).toMatchObject({ ...integrity, crossings: 0 });
      expect(completeTreeRouting(candidate, plan)).toBe(true);
      const svg = buildChartSvg(candidate, "Synthetic partial sibling histories", undefined, language, plan).svg;
      for (const person of data.people) expect(svg).toContain(person.displayName);
      expect(svg).toContain(language === "id" ? "Wali" : "Guardian");
      for (const family of plan.families) for (const annotation of family.childLabels ?? []) {
        const recorded = raw.relationships.filter((edge) => edge.kind === "parent" &&
          family.parentIds.includes(edge.fromPersonId) && edge.toPersonId === annotation.childId);
        expect([...annotation.relationshipIds].sort()).toEqual(recorded.map((edge) => edge.id).sort());
      }
    }
    expect(JSON.stringify(raw)).toBe(before);
  });

  it("keeps only each focused child's own parent records and complete care labels", () => {
    const data = indonesianFamilyFixture(100, "partial-parent-sets");
    for (const id of ["synthetic-0002", "synthetic-0003", "synthetic-0008"]) {
      const focus = focusedFamily(data.people, data.relationships, { personId: id, ancestors: 1, descendants: 1 });
      const result = prepareTree({ ...focus, requestKey: id, layoutMode: "focus",
        generationLimits: { ancestors: null, descendants: null }, language: "id", relationshipLanguage: "id", controlsVisible: false });
      expect(result.geometryLayout.familyRouteGeometry).toBeUndefined();
      expect(result.geometryLayout.people.length).toBeLessThan(25);
      expect(routeClarity(result.geometryLayout, result.connectionPlan)).toMatchObject(integrity);
      expect(result.geometryLayout.relationships.filter((edge) => edge.kind === "parent" && edge.toPersonId === id).map((edge) => edge.id).sort())
        .toEqual(data.relationships.filter((edge) => edge.kind === "parent" && edge.toPersonId === id).map((edge) => edge.id).sort());
    }
  });
});
