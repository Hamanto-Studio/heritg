import { describe, expect, it } from "vitest";
import { prepareTree } from "./treePreparation";
import { indonesianFamilyFixture } from "./testFixtures/indonesianFamilies";
import { routeClarity } from "./testFixtures/routeClarity";
import { visibleConnectionPlan } from "./visibleConnectionPlan";

describe("provisional household joins occupied by an earlier detour", () => {
  it.each([{ size: 100, seed: 0 }, { size: 250, seed: 0 }, ...[0, 2, 4].map((seed) => ({ size: 500, seed }))])(
    "repairs overlapping joins without disconnecting people in a $size-person mixed intermarrying family, seed $seed", ({ size, seed }) => {
    const data = indonesianFamilyFixture(size, "interwoven", seed), before = JSON.stringify(data);
    const result = prepareTree({ ...data, requestKey: "interwoven-recovery", generationLimits: { ancestors: null, descendants: null },
      // Exercise the general router itself. A better Full-layout candidate
      // must not mask regressions in the occupied-join repair.
      language: "id", relationshipLanguage: "id", controlsVisible: false, layoutMode: "focus" });
    const expected = { people: size, relationships: data.relationships.length, missingParentOrPartnerEdges: 0,
      missingTerminals: 0, disconnectedRoutes: 0, diagonalSegments: 0, obstacleHits: 0, personOverlaps: 0,
      reversedParentDirections: 0, conflatedParentSets: 0, unlabeledParentTypes: 0, unrelatedOverlaps: 0, failures: 0 };
    const metrics = routeClarity(result.geometryLayout, result.connectionPlan);
    console.info(JSON.stringify({ scenario: "interwoven", seed, ...metrics }));
    // This protects actual connections, not an overall clarity claim: residual
    // crossings remain measured in the workstream and must still be reduced.
    expect(metrics).toMatchObject(expected);
    expect(routeClarity(result.geometryLayout, visibleConnectionPlan(result.connectionPlan, result.geometryLayout, "id"))).toMatchObject(expected);
    expect(JSON.stringify(data)).toBe(before);
  }, 60000);
});
