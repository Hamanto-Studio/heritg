import { describe, expect, it } from "vitest";
import { untangleFamilyRails } from "./untangleFamilyRails";
import { directedFamilyCorridors } from "./directedFamilyCorridors";
import { createConnectionPlan } from "./connectionPlan";
import { completeTreeRouting } from "./fullTreeRouting";
import { createTreeLayout } from "./layout";
import { visibleConnectionPlan } from "./visibleConnectionPlan";
import { indonesianFamilyFixture } from "./testFixtures/indonesianFamilies";
import { routeClarity } from "./testFixtures/routeClarity";

const integrity = { missingParentOrPartnerEdges: 0, missingTerminals: 0, disconnectedRoutes: 0,
  diagonalSegments: 0, obstacleHits: 0, personOverlaps: 0, reversedParentDirections: 0,
  conflatedParentSets: 0, unlabeledParentTypes: 0, unrelatedOverlaps: 0, failures: 0 };

describe("family rails reconsidered against later branches", () => {
  it.each(["en", "id"] as const)("reduces crossings without moving people, ports or records in %s", (language) => {
    const data = indonesianFamilyFixture(100, "interwoven");
    const raw = createTreeLayout(data.people, data.relationships);
    const layout = directedFamilyCorridors({ ...raw, people: raw.people.map((person) => ({ ...person, role: " " })) },
      { prefer: "parents", reverse: true })!;
    const plan = createConnectionPlan(layout, language, undefined, false), before = JSON.stringify({ layout, plan });
    const candidate = untangleFamilyRails(layout, plan)!;
    expect(candidate).toBeDefined();
    expect(candidate.people).toBe(layout.people);
    expect(candidate.relationships).toBe(layout.relationships);
    for (const family of plan.families) {
      const changed = candidate.familyRouteGeometry![family.id];
      expect(family.parentIds.map((id) => changed.parentPorts[id])).toEqual(family.parentPorts);
      expect(family.childIds.map((id) => changed.childPorts[id])).toEqual(family.childPorts);
    }
    const clearer = createConnectionPlan(candidate, language, undefined, false);
    expect(completeTreeRouting(candidate, clearer)).toBe(true);
    expect(routeClarity(candidate, clearer)).toMatchObject(integrity);
    expect(clearer.crossings.length).toBeLessThan(plan.crossings.length);
    const visible = { ...candidate, people: candidate.people.map((person) => ({ ...person, role: "" })) };
    expect(routeClarity(visible, visibleConnectionPlan(clearer, visible, language))).toMatchObject(integrity);
    expect(JSON.stringify({ layout, plan })).toBe(before);
  });

  it("leaves clear and invalid drawings untouched instead of weakening validation", () => {
    const data = indonesianFamilyFixture(31, "extended"), layout = createTreeLayout(data.people, data.relationships);
    const plan = createConnectionPlan(layout, "id", undefined, false);
    expect(plan.crossings).toHaveLength(0);
    expect(untangleFamilyRails(layout, plan)).toBeUndefined();
    expect(untangleFamilyRails(layout, { ...plan, isValid: false, crossings: [{ x: 0, y: 0, kind: "parent", horizontalKind: "parent" }] })).toBeUndefined();
  });
});
