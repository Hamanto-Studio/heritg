import { describe, expect, it } from "vitest";
import { crossGenerationFamilyFixture } from "./testFixtures/crossGenerationFamilies";
import { indonesianFamilyFixture } from "./testFixtures/indonesianFamilies";
import { routeClarity } from "./testFixtures/routeClarity";
import { prepareTree } from "./treePreparation";
import { visibleConnectionPlan } from "./visibleConnectionPlan";
import { focusedFamily } from "./focusedFamily";
import { buildChartSvg } from "./chartExport";

const integrity = { missingParentOrPartnerEdges: 0, missingTerminals: 0, disconnectedRoutes: 0, diagonalSegments: 0,
  obstacleHits: 0, personOverlaps: 0, reversedParentDirections: 0, conflatedParentSets: 0,
  unlabeledParentTypes: 0, unlabeledCareLabels: 0, unrelatedOverlaps: 0, crossings: 0, failures: 0 };
const prepare = (data: ReturnType<typeof crossGenerationFamilyFixture>, language: "en" | "id" = "id") => prepareTree({ ...data,
  requestKey: "cross-depth-marriage", generationLimits: { ancestors: null, descendants: null },
  language, relationshipLanguage: language, controlsVisible: false, layoutMode: "full" });

describe("marriages joining different recorded ancestry depths", () => {
  it("adds only one plausible historical union, preserving both disjoint recorded ancestries", () => {
    for (const size of [100, 250, 500]) for (const seed of [0, 2, 4]) {
      const base = indonesianFamilyFixture(size, "compound", seed), data = crossGenerationFamilyFixture(size, seed);
      expect(data.people).toEqual(base.people);
      expect(data.relationships.slice(0, -1)).toEqual(base.relationships);
      const marriage = data.relationships.at(-1)!;
      const parents = (id: string): string[] => base.relationships.filter((edge) => edge.kind === "parent" && edge.toPersonId === id).map((edge) => edge.fromPersonId);
      const ancestors = (id: string) => {
        const result = new Set<string>(), queue = [...parents(id)];
        for (let i = 0; i < queue.length; i++) if (!result.has(queue[i])) { result.add(queue[i]); queue.push(...parents(queue[i])); }
        return result;
      };
      const depth = (id: string): number => Math.max(-1, ...parents(id).map(depth)) + 1;
      const pair = data.marriagePair.map((id) => base.people.find((person) => person.id === id)!);
      expect(pair.map((person) => person.gender)).toEqual(["male", "female"]);
      expect(data.ancestryDepths).toEqual(data.marriagePair.map(depth));
      expect(data.ancestryDepths[0]).not.toBe(data.ancestryDepths[1]);
      expect([...ancestors(pair[0].id)].some((id) => ancestors(pair[1].id).has(id))).toBe(false);
      for (const [index, person] of pair.entries()) {
        expect(ancestors(person.id).has(pair[1 - index].id)).toBe(false);
        expect(base.relationships.some((edge) => edge.kind === "partner" && [edge.fromPersonId, edge.toPersonId].includes(person.id))).toBe(false);
        expect(base.relationships.some((edge) => edge.kind === "parent" && edge.fromPersonId === person.id)).toBe(false);
        expect(Number(marriage.marriageDate!.slice(0, 4)) - Number(person.birthDate!.slice(0, 4))).toBeGreaterThanOrEqual(25);
        if (person.deathDate) expect(marriage.marriageDate! < person.deathDate).toBe(true);
      }
      expect(marriage.marriageDate! <= "2026-12-31").toBe(true);
    }
  });

  it.each([100, 250, 500].flatMap((size) => [0, 2, 4].map((seed) => ({ size, seed })) ))(
    "keeps every route clear in Full with $size people, seed $seed", ({ size, seed }) => {
      const data = crossGenerationFamilyFixture(size, seed), before = JSON.stringify(data);
      const start = performance.now(), result = prepare(data), metrics = routeClarity(result.geometryLayout, result.connectionPlan);
      console.info(JSON.stringify({ size, seed, ms: Math.round(performance.now() - start), ...metrics }));
      expect(metrics).toMatchObject({ ...integrity, people: size, relationships: data.relationships.length });
      expect(result.connectionPlan.nonParentRoutes.some((route) => route.id === data.marriageId)).toBe(true);
      expect(routeClarity(result.geometryLayout, visibleConnectionPlan(result.connectionPlan, result.geometryLayout, "id"))).toMatchObject(integrity);
      expect(JSON.stringify(data)).toBe(before);
    }, 30000);

  it.each(["en", "id"] as const)("keeps step-parents above their children and complete exports after renaming 500 records in %s", (language) => {
    const original = crossGenerationFamilyFixture(500);
    const ids = new Map(original.people.map((person, index) => [person.id, `person-${(index * 37) % 503}`]));
    const data = { ...original, rootId: ids.get(original.rootId)!,
      people: [...original.people].reverse().map((person) => ({ ...person, id: ids.get(person.id)! })),
      relationships: [...original.relationships].reverse().map((edge, index) => ({ ...edge, id: `record-${index}`,
        fromPersonId: ids.get(edge.fromPersonId)!, toPersonId: ids.get(edge.toPersonId)! })) };
    const result = prepare(data, language);
    expect(routeClarity(result.geometryLayout, result.connectionPlan)).toMatchObject(integrity);
    const reversed = prepare({ ...data, people: [...data.people].reverse(), relationships: [...data.relationships].reverse() }, language);
    expect(reversed.geometryLayout).toEqual(result.geometryLayout);
    const svg = new DOMParser().parseFromString(buildChartSvg(result.geometryLayout, "Synthetic different-depth families", undefined, language, result.connectionPlan).svg, "image/svg+xml");
    expect(svg.querySelectorAll("[data-person-id]")).toHaveLength(500);
    for (const person of data.people) expect(svg.documentElement.textContent).toContain(person.displayName);
    for (const family of result.connectionPlan.families) expect(svg.querySelector(`[data-family-id="${family.id}"]`)).not.toBeNull();
    for (const route of result.connectionPlan.nonParentRoutes) expect(svg.querySelector(`[data-route-id="${route.id}"]`)).not.toBeNull();
  }, 30000);

  it("keeps either partner's Focus family complete and compact", () => {
    const data = crossGenerationFamilyFixture(500), before = JSON.stringify(data);
    for (const personId of data.marriagePair) {
      const expected = focusedFamily(data.people, data.relationships, { personId, ancestors: 2, descendants: 1, siblings: true });
      const result = prepareTree({ ...expected, requestKey: personId, generationLimits: { ancestors: null, descendants: null },
        language: "id", relationshipLanguage: "id", layoutMode: "focus", controlsVisible: false });
      expect(new Set(result.geometryLayout.people.map((person) => person.id))).toEqual(new Set(expected.people.map((person) => person.id)));
      expect(result.geometryLayout.familyRouteGeometry).toBeUndefined();
      expect(result.geometryLayout.people.length).toBeLessThan(40);
      expect(routeClarity(result.geometryLayout, result.connectionPlan)).toMatchObject(integrity);
    }
    expect(JSON.stringify(data)).toBe(before);
  });
});
