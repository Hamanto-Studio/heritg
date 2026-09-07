import { describe, expect, it } from "vitest";
import { cousinFamilyFixture } from "./testFixtures/cousinFamilies";
import { indonesianFamilyFixture } from "./testFixtures/indonesianFamilies";
import { routeClarity } from "./testFixtures/routeClarity";
import { prepareTree } from "./treePreparation";
import { visibleConnectionPlan } from "./visibleConnectionPlan";
import { buildChartSvg } from "./chartExport";
import { focusedFamily } from "./focusedFamily";

const integrity = { missingParentOrPartnerEdges: 0, missingTerminals: 0, disconnectedRoutes: 0, diagonalSegments: 0,
  obstacleHits: 0, personOverlaps: 0, reversedParentDirections: 0, conflatedParentSets: 0,
  unlabeledParentTypes: 0, unlabeledCareLabels: 0, unrelatedOverlaps: 0, crossings: 0, failures: 0 };
const prepare = (data: ReturnType<typeof cousinFamilyFixture>, language: "en" | "id" = "id") => prepareTree({ ...data,
  requestKey: "cousin-reconnection", generationLimits: { ancestors: null, descendants: null },
  language, relationshipLanguage: language, controlsVisible: false, layoutMode: "full" });

describe("reconverging adult-cousin families", () => {
  it.each(["extended", "compound", "interwoven"] as const)("adds only a valid adult cousin union to the 500-person %s archive", (scenario) => {
    for (const seed of [0, 2, 4]) {
      const data = cousinFamilyFixture(500, scenario, seed), base = indonesianFamilyFixture(500, scenario, seed);
      expect(data.people).toEqual(base.people);
      expect(data.relationships.slice(0, -1)).toEqual(base.relationships);
      const pair = data.cousinPair.map((id) => data.people.find((person) => person.id === id)!);
      expect(pair.map((person) => person.gender)).toEqual(["male", "female"]);
      const marriage = data.relationships.at(-1)!;
      const parents = (id: string) => base.relationships.filter((edge) => edge.subtype === "biologicalParent" && edge.toPersonId === id).map((edge) => edge.fromPersonId);
      const grandparents = (id: string) => parents(id).flatMap(parents);
      expect(parents(pair[0].id).some((id) => parents(pair[1].id).includes(id))).toBe(false);
      expect(grandparents(pair[0].id).some((id) => grandparents(pair[1].id).includes(id))).toBe(true);
      for (const person of pair) {
        expect(base.relationships.some((edge) => edge.kind === "partner" && [edge.fromPersonId, edge.toPersonId].includes(person.id))).toBe(false);
        expect(Number(marriage.marriageDate!.slice(0, 4)) - Number(person.birthDate!.slice(0, 4))).toBeGreaterThanOrEqual(25);
        if (person.deathDate) expect(marriage.marriageDate! < person.deathDate).toBe(true);
      }
      expect(marriage.marriageDate! <= "2026-12-31").toBe(true);
    }
  });

  it.each([100, 250, 500].flatMap((size) => (["compound", "interwoven"] as const).map((scenario) => ({ size, scenario }))))(
    "keeps every route clear in the actual Full entry for $size-person $scenario cousin families", ({ size, scenario }) => {
      const data = cousinFamilyFixture(size, scenario), before = JSON.stringify(data), result = prepare(data);
      const metrics = routeClarity(result.geometryLayout, result.connectionPlan);
      console.info(JSON.stringify({ size, scenario, ...metrics }));
      expect(metrics).toMatchObject({ ...integrity, people: size, relationships: data.relationships.length });
      expect(result.connectionPlan.nonParentRoutes.some((route) => route.id === data.marriageId)).toBe(true);
      expect(routeClarity(result.geometryLayout, visibleConnectionPlan(result.connectionPlan, result.geometryLayout, "id"))).toMatchObject(integrity);
      expect(JSON.stringify(data)).toBe(before);
    }, 30000);

  it.each([2, 4])("keeps an external descendant branch clear through nested 500-person loops, seed %i", (seed) => {
    const data = cousinFamilyFixture(500, "interwoven", seed), before = JSON.stringify(data);
    const result = prepare(data);
    expect(routeClarity(result.geometryLayout, result.connectionPlan)).toMatchObject({ ...integrity, people: 500, relationships: data.relationships.length });
    expect(routeClarity(result.geometryLayout, visibleConnectionPlan(result.connectionPlan, result.geometryLayout, "id"))).toMatchObject(integrity);
    expect(JSON.stringify(data)).toBe(before);
  }, 30000);

  it.each((["en", "id"] as const).flatMap((language) => [
    { language, size: 100, scenario: "compound" as const }, { language, size: 500, scenario: "interwoven" as const }
  ]))("retains all names, paths and typed labels after renaming $size-person $scenario records in $language", ({ language, size, scenario }) => {
    const original = cousinFamilyFixture(size, scenario);
    const ids = new Map(original.people.map((person, index) => [person.id, `renamed-${(index * 37) % 503}`]));
    const data = { ...original, rootId: ids.get(original.rootId)!,
      people: [...original.people].reverse().map((person) => ({ ...person, id: ids.get(person.id)! })),
      relationships: [...original.relationships].reverse().map((edge, index) => ({ ...edge, id: `record-${index}`,
        fromPersonId: ids.get(edge.fromPersonId)!, toPersonId: ids.get(edge.toPersonId)! })) };
    const result = prepare(data, language);
    expect(routeClarity(result.geometryLayout, result.connectionPlan)).toMatchObject(integrity);
    const reordered = prepare({ ...data, people: [...data.people].reverse(), relationships: [...data.relationships].reverse() }, language);
    expect(reordered.geometryLayout).toEqual(result.geometryLayout);
    const svg = new DOMParser().parseFromString(buildChartSvg(result.geometryLayout, "Synthetic cousin families", undefined, language, result.connectionPlan).svg, "image/svg+xml");
    expect(svg.querySelectorAll("[data-person-id]")).toHaveLength(size);
    for (const person of data.people) expect(svg.documentElement.textContent).toContain(person.displayName);
    for (const family of result.connectionPlan.families) expect(svg.querySelector(`[data-family-id="${family.id}"]`)).not.toBeNull();
    for (const route of result.connectionPlan.nonParentRoutes) expect(svg.querySelector(`[data-route-id="${route.id}"]`)).not.toBeNull();
  }, 30000);

  it("keeps Focus compact with both partners' recorded ancestry", () => {
    const data = cousinFamilyFixture(500, "compound"), before = JSON.stringify(data);
    for (const personId of data.cousinPair) {
      const familyFocus = { personId, ancestors: 2, descendants: 1, siblings: true };
      const expected = focusedFamily(data.people, data.relationships, familyFocus);
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
