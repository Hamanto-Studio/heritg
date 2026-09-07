import { describe, expect, it } from "vitest";
import { reconnectingFamilyCorridors } from "./directedFamilyCorridors";
import { createConnectionPlan } from "./connectionPlan";
import { completeTreeRouting } from "./fullTreeRouting";
import { createTreeLayout } from "./layout";
import { indonesianFamilyFixture } from "./testFixtures/indonesianFamilies";
import { routeClarity } from "./testFixtures/routeClarity";
import { visibleConnectionPlan } from "./visibleConnectionPlan";
import { buildChartSvg } from "./chartExport";

const integrity = { missingParentOrPartnerEdges: 0, missingTerminals: 0, disconnectedRoutes: 0,
  diagonalSegments: 0, obstacleHits: 0, personOverlaps: 0, reversedParentDirections: 0,
  conflatedParentSets: 0, unlabeledParentTypes: 0, unrelatedOverlaps: 0, failures: 0, crossings: 0 };
const prepare = (data: ReturnType<typeof indonesianFamilyFixture>) => {
  const raw = createTreeLayout(data.people, data.relationships);
  return { ...raw, people: raw.people.map((person) => ({ ...person, role: " " })) };
};

describe("whole reconnecting sibling-family blocks", () => {
  it.each([0, 1, 2, 3, 4, 11].flatMap((seed) => (["en", "id"] as const).map((language) => ({ seed, language }))))(
    "keeps complete attached unions and care branches clear, seed $seed, $language", ({ seed, language }) => {
      const data = indonesianFamilyFixture(100, "interwoven", seed), raw = prepare(data), before = JSON.stringify(raw);
      const candidate = reconnectingFamilyCorridors(raw)!;
      expect(candidate).toBeDefined();
      expect(candidate.relationships).toBe(raw.relationships);
      expect(candidate.people.map((person) => ({ ...person, x: 0, y: 0 })))
        .toEqual(raw.people.map((person) => ({ ...person, x: 0, y: 0 })));
      const plan = createConnectionPlan(candidate, language, undefined, false);
      expect(completeTreeRouting(candidate, plan)).toBe(true);
      expect(routeClarity(candidate, plan)).toMatchObject(integrity);
      expect(routeClarity(candidate, visibleConnectionPlan(plan, candidate, language))).toMatchObject(integrity);
      const shuffled = reconnectingFamilyCorridors(prepare({ ...data, people: [...data.people].reverse(), relationships: [...data.relationships].reverse() }))!;
      expect(new Map(shuffled.people.map((person) => [person.id, [person.x, person.y]])))
        .toEqual(new Map(candidate.people.map((person) => [person.id, [person.x, person.y]])));
      expect(shuffled.familyRouteGeometry).toEqual(candidate.familyRouteGeometry);
      expect(JSON.stringify(raw)).toBe(before);
    });

  it("declines unsupported cycle shapes, partial records and acyclic trees", () => {
    expect(reconnectingFamilyCorridors(prepare(indonesianFamilyFixture(100, "extended")))).toBeUndefined();
    expect(reconnectingFamilyCorridors(prepare(indonesianFamilyFixture(100, "shared-adoption")))).toBeUndefined();
    const data = indonesianFamilyFixture(100, "interwoven"), raw = prepare(data);
    expect(reconnectingFamilyCorridors({ ...raw, people: raw.people.slice(1) })).toBeUndefined();
    expect(reconnectingFamilyCorridors({ ...raw, people: [...raw.people, raw.people[0]] })).toBeUndefined();
    expect(reconnectingFamilyCorridors({ ...raw, relationships: [...raw.relationships, {
      ...raw.relationships[0], id: "loop", toPersonId: raw.relationships[0].fromPersonId
    }] })).toBeUndefined();
  });

  it.each([3, 11, 21, 38, 55])("retains the correct attachment when entering a block from an added guardian of person %i", (index) => {
    const original = indonesianFamilyFixture(100, "interwoven", 4), child = original.people[index];
    const guardian = { ...child, id: "000-guardian-entry", displayName: "Additional synthetic guardian",
      birthDate: `${Number(child.birthDate!.slice(0, 4)) - 30}-01-01`, deathDate: undefined };
    const data = { ...original, people: [...original.people, guardian], relationships: [...original.relationships, {
      id: "additional-guardian", treeId: child.treeId, fromPersonId: guardian.id, toPersonId: child.id,
      kind: "parent" as const, subtype: "guardian" as const, createdAt: "2026-01-01T00:00:00.000Z"
    }] };
    const candidate = reconnectingFamilyCorridors(prepare(data))!;
    expect(candidate).toBeDefined();
    const plan = createConnectionPlan(candidate, "id", undefined, false);
    expect(completeTreeRouting(candidate, plan)).toBe(true);
    expect(routeClarity(candidate, plan)).toMatchObject({ ...integrity, people: 101, relationships: data.relationships.length });
  });

  it("does not depend on the fixture's person or relationship identifiers", () => {
    const source = indonesianFamilyFixture(100, "interwoven", 2);
    const ids = new Map(source.people.map((person, index) => [person.id, `person-${(index * 37) % 101}`]));
    const data = { ...source, rootId: ids.get(source.rootId)!, people: source.people.map((person) => ({ ...person, id: ids.get(person.id)! })),
      relationships: source.relationships.map((edge, index) => ({ ...edge, id: `edge-${source.relationships.length - index}`,
        fromPersonId: ids.get(edge.fromPersonId)!, toPersonId: ids.get(edge.toPersonId)! })) };
    const candidate = reconnectingFamilyCorridors(prepare(data))!;
    expect(candidate).toBeDefined();
    expect(routeClarity(candidate, createConnectionPlan(candidate, "id", undefined, false))).toMatchObject(integrity);
  });

  it.each(["en", "id"] as const)("exports all 500 people and every typed family path in %s", (language) => {
    const data = indonesianFamilyFixture(500, "interwoven", 4), candidate = reconnectingFamilyCorridors(prepare(data))!;
    const plan = createConnectionPlan(candidate, language, undefined, false);
    expect(routeClarity(candidate, plan)).toMatchObject(integrity);
    const svg = new DOMParser().parseFromString(buildChartSvg(candidate, "Synthetic mixed family", undefined, language, plan).svg, "image/svg+xml");
    expect(svg.querySelectorAll("[data-person-id]")).toHaveLength(500);
    for (const person of data.people) expect(svg.documentElement.textContent).toContain(person.displayName);
    for (const family of plan.families) expect(svg.querySelector(`[data-family-id="${family.id}"]`)).not.toBeNull();
    for (const route of plan.nonParentRoutes) expect(svg.querySelector(`[data-route-id="${route.id}"]`)).not.toBeNull();
    for (const family of plan.families) for (const annotation of family.childLabels ?? [])
      expect(svg.documentElement.textContent).toContain(annotation.label.text);
  }, 15000);
});
