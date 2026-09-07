import { describe, expect, it } from "vitest";
import { prepareTree } from "./treePreparation";
import { indonesianFamilyFixture, indonesianScenarios, reconnectedScenarios } from "./testFixtures/indonesianFamilies";
import { routeClarity } from "./testFixtures/routeClarity";
import { measuredCrossings, threeParentSetWitnesses } from "./testFixtures/crossingAudit";
import { pointOnSegment, pointsEqual } from "./connectionGeometry";

const scenarios = [...indonesianScenarios, ...reconnectedScenarios];
const matrix = scenarios.flatMap((scenario) => [100, 250, 500].flatMap((size) => [0, 2, 4].map((seed) => ({ scenario, size, seed }))));
const sortedRecords = <T extends { id: string }>(records: T[]) => [...records].sort((a, b) => a.id.localeCompare(b.id));

describe("Full-tree acceptance through the interactive preparation entry", () => {
  it.each(matrix)("preserves and clearly routes $size people: $scenario / seed $seed", ({ scenario, size, seed }) => {
    const data = indonesianFamilyFixture(size, scenario, seed), before = JSON.stringify(data);
    const { geometryLayout: layout, connectionPlan: plan } = prepareTree({ ...data, requestKey: "acceptance",
      layoutMode: "full", language: "id", relationshipLanguage: "id", controlsVisible: false,
      generationLimits: { ancestors: null, descendants: null } });
    expect(routeClarity(layout, plan)).toMatchObject({ people: size, relationships: data.relationships.length,
      missingParentOrPartnerEdges: 0, missingTerminals: 0, disconnectedRoutes: 0, diagonalSegments: 0,
      obstacleHits: 0, personOverlaps: 0, reversedParentDirections: 0, conflatedParentSets: 0,
      unlabeledParentTypes: 0, unlabeledCareLabels: 0, unrelatedOverlaps: 0, failures: 0 });
    expect(sortedRecords(layout.relationships)).toEqual(sortedRecords(data.relationships));
    expect(layout.people.map((person) => person.id).sort()).toEqual(data.people.map((person) => person.id).sort());
    for (const person of layout.people) {
      expect(person).toMatchObject(data.people.find((record) => record.id === person.id)!);
      expect(Number.isFinite(person.x) && Number.isFinite(person.y)).toBe(true);
    }
    const measured = measuredCrossings(plan);
    expect(measured.map(({ x, y }) => ({ x, y }))).toEqual(plan.crossings.map(({ x, y }) => ({ x, y })));
    const witnesses = threeParentSetWitnesses(data.relationships);
    expect(witnesses).toHaveLength(scenario === "shared-parent-sets" ? Math.floor(size / 9) : 0);
    for (const witness of witnesses) {
      const families = plan.families.filter((family) => !family.care &&
        JSON.stringify([...family.childIds].sort()) === JSON.stringify(witness.childIds) &&
        witness.parentSets.some((parents) => JSON.stringify([...family.parentIds].sort()) === JSON.stringify(parents)));
      expect(families).toHaveLength(3);
      // The contraction argument needs an internal family bus, not a route
      // that passes through one child's vertex to reach the other children.
      // Every child is a leaf of each of its three connected family networks.
      for (const family of families) for (const port of family.childPorts) {
        const incident = family.segments.filter((segment) => pointOnSegment(port, segment));
        expect(incident).toHaveLength(1);
        expect(pointsEqual(port, incident[0].start) || pointsEqual(port, incident[0].end)).toBe(true);
      }
    }
    expect(measured, `${scenario}/${size}/${seed}: crossings beyond a verified lower bound`).toHaveLength(witnesses.length);
    const usedWitnesses = new Set<number>();
    for (const crossing of measured) {
      expect(crossing.owners).toHaveLength(2);
      const families = crossing.owners.map((id) => plan.families.find((family) => `family:${family.id}` === id));
      expect(families.every((family) => family && !family.care)).toBe(true);
      const index = witnesses.findIndex((witness) => families.every((family) =>
        JSON.stringify([...family!.childIds].sort()) === JSON.stringify(witness.childIds) &&
        witness.parentSets.some((parents) => JSON.stringify([...family!.parentIds].sort()) === JSON.stringify(parents))));
      expect(index).toBeGreaterThanOrEqual(0);
      expect(usedWitnesses.has(index)).toBe(false);
      usedWitnesses.add(index);
    }
    expect(JSON.stringify(data)).toBe(before);
  }, 60000);
});
