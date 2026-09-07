import { describe, expect, it } from "vitest";
import { directedFamilyCorridors } from "./directedFamilyCorridors";
import { createTreeLayout } from "./layout";
import { createConnectionPlan } from "./connectionPlan";
import { completeTreeRouting } from "./fullTreeRouting";
import { prepareTree } from "./treePreparation";
import { visibleConnectionPlan } from "./visibleConnectionPlan";
import { buildChartSvg } from "./chartExport";
import { indonesianFamilyFixture } from "./testFixtures/indonesianFamilies";
import { routeClarity } from "./testFixtures/routeClarity";

const integrity = { missingParentOrPartnerEdges: 0, missingTerminals: 0, disconnectedRoutes: 0,
  diagonalSegments: 0, obstacleHits: 0, personOverlaps: 0, reversedParentDirections: 0,
  conflatedParentSets: 0, unlabeledParentTypes: 0, unrelatedOverlaps: 0, failures: 0 };
const prepare = (data: ReturnType<typeof indonesianFamilyFixture>, language: "en" | "id" = "id", layoutMode: "full" | "focus" = "full") =>
  prepareTree({ ...data, requestKey: "reconnecting-families", language, relationshipLanguage: language,
    generationLimits: { ancestors: null, descendants: null }, controlsVisible: false, layoutMode });

describe("complete reconnections after whole-branch placement", () => {
  it.each([0, 2, 4])("reduces mixed 500-person crossings without losing any relationship, seed %i", (seed) => {
    const data = indonesianFamilyFixture(500, "interwoven", seed), before = JSON.stringify(data);
    const result = prepare(data), metrics = routeClarity(result.geometryLayout, result.connectionPlan);
    expect(metrics).toMatchObject({ ...integrity, people: 500, relationships: data.relationships.length });
    // Originally 333/384/593, then 31/34/38 after segment detours. Whole-loop
    // placement keeps both sibling origin families and their married branches
    // together. Every typed connection must survive the zero-crossing result.
    expect(metrics.crossings).toBe(0);
    expect(routeClarity(result.geometryLayout, visibleConnectionPlan(result.connectionPlan, result.geometryLayout, "id"))).toMatchObject(integrity);
    expect(JSON.stringify(data)).toBe(before);
    console.info(JSON.stringify({ seed, ...metrics }));
  }, 60000);

  it("rejects a scaffold with reversed parent directions, retaining the original graph", () => {
    const data = indonesianFamilyFixture(100, "interwoven"), raw = createTreeLayout(data.people, data.relationships);
    const layout = { ...raw, people: raw.people.map((person) => ({ ...person, role: " " })) }, before = JSON.stringify(layout);
    expect(directedFamilyCorridors(layout, { prefer: "children", reverse: false })).toBeUndefined();
    const candidate = directedFamilyCorridors(layout, { prefer: "parents", reverse: true })!;
    const plan = createConnectionPlan(candidate, "id", undefined, false);
    expect(completeTreeRouting(candidate, plan)).toBe(true);
    expect(candidate.relationships).toEqual(layout.relationships);
    expect(candidate.people.map((person) => ({ ...person, x: 0, y: 0 })))
      .toEqual(layout.people.map((person) => ({ ...person, x: 0, y: 0 })));
    expect(JSON.stringify(layout)).toBe(before);
  });

  it.each(["en", "id"] as const)("preserves typed paths, names and selected/unselected terminals in %s exports", (language) => {
    const data = indonesianFamilyFixture(100, "interwoven"), result = prepare(data, language);
    for (const selected of [undefined, data.rootId]) {
      const visible = visibleConnectionPlan(result.connectionPlan, result.geometryLayout, language, selected);
      expect(routeClarity(result.geometryLayout, visible)).toMatchObject(integrity);
      const svg = new DOMParser().parseFromString(buildChartSvg(result.geometryLayout, "Synthetic mixed family", selected, language, visible).svg, "image/svg+xml");
      expect(svg.querySelectorAll("[data-person-id]")).toHaveLength(100);
      for (const person of data.people) expect(svg.documentElement.textContent).toContain(person.displayName);
      for (const family of visible.families) expect(svg.querySelector(`[data-family-id="${family.id}"]`)).not.toBeNull();
      for (const route of visible.nonParentRoutes) expect(svg.querySelector(`[data-route-id="${route.id}"]`)).not.toBeNull();
    }
  });

  it("keeps Focus compact and evaluates renamed and reordered records without mutation", () => {
    const original = indonesianFamilyFixture(100, "interwoven");
    const ids = new Map(original.people.map((person, i) => [person.id, `renamed-${(i * 37) % 101}`]));
    const data = { ...original, rootId: ids.get(original.rootId)!,
      people: [...original.people].reverse().map((person) => ({ ...person, id: ids.get(person.id)! })),
      relationships: [...original.relationships].reverse().map((edge, i) => ({ ...edge, id: `record-${i}`,
        fromPersonId: ids.get(edge.fromPersonId)!, toPersonId: ids.get(edge.toPersonId)! })) };
    const snapshot = JSON.stringify(data), result = prepare(data), baseline = prepare(data, "id", "focus");
    expect(routeClarity(result.geometryLayout, result.connectionPlan)).toMatchObject(integrity);
    expect(result.connectionPlan.crossings.length).toBeLessThanOrEqual(baseline.connectionPlan.crossings.length);
    expect(baseline.geometryLayout).toEqual(createTreeLayout(data.people, data.relationships));
    const reordered = prepare({ ...data, people: [...data.people].reverse(), relationships: [...data.relationships].reverse() });
    expect(new Map(reordered.geometryLayout.people.map((person) => [person.id, { x: person.x, y: person.y }])))
      .toEqual(new Map(result.geometryLayout.people.map((person) => [person.id, { x: person.x, y: person.y }])));
    expect(JSON.stringify(data)).toBe(snapshot);
  }, 10000);
});
