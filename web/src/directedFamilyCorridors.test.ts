import { describe, expect, it } from "vitest";
import { directedFamilyCorridors } from "./directedFamilyCorridors";
import { createTreeLayout } from "./layout";
import { createConnectionPlan } from "./connectionPlan";
import { buildChartSvg } from "./chartExport";
import { routeClarity } from "./testFixtures/routeClarity";
import { indonesianFamilyFixture } from "./testFixtures/indonesianFamilies";
import type { TreeLayout } from "./types";

const integrity = { missingParentOrPartnerEdges: 0, missingTerminals: 0, disconnectedRoutes: 0,
  diagonalSegments: 0, obstacleHits: 0, personOverlaps: 0, reversedParentDirections: 0,
  conflatedParentSets: 0, unlabeledParentTypes: 0, unrelatedOverlaps: 0, failures: 0 };
const source = (size: number, seed = 0) => {
  const data = indonesianFamilyFixture(size, "compound", seed);
  const layout = createTreeLayout(data.people, data.relationships);
  // Exactly the blank relationship-label reservation used by the worker.
  return { data, layout: { ...layout, people: layout.people.map((person) => ({ ...person, role: " " })) } };
};

describe("coordinated whole-branch corridor construction", () => {
  it.each([0, 2, 4])("improves the complete 500-person compound plan for seed %i without losing any connection", (seed) => {
    const { data, layout } = source(500, seed), before = JSON.stringify(layout);
    const baseline = createConnectionPlan(layout, "id", undefined, true);
    const candidate = directedFamilyCorridors(layout)!;
    expect(candidate).toBeDefined();
    const plan = createConnectionPlan(candidate, "id", undefined, true);
    const result = routeClarity(candidate, plan);
    console.info(JSON.stringify({ scenario: "compound", seed, baseline: baseline.crossings.length, candidate: result }));
    expect(result).toMatchObject({ ...integrity, people: 500, relationships: data.relationships.length, crossings: 0 });
    expect(plan.isValid).toBe(true);
    expect(result.crossings).toBeLessThan(baseline.crossings.length);
    expect(plan.crossings.filter((crossing) => crossing.kind === "parent" && crossing.horizontalKind === "parent")).toHaveLength(0);
    expect(candidate.relationships).toEqual(layout.relationships);
    expect(candidate.people.map((person) => ({ ...person, x: 0, y: 0 })))
      .toEqual(layout.people.map((person) => ({ ...person, x: 0, y: 0 })));
    expect(JSON.stringify(layout)).toBe(before);
  }, 30000);

  it.each([31, 100])("removes the nested marriages and ancestry crossings at %i people too", (size) => {
    const candidate = directedFamilyCorridors(source(size).layout)!;
    expect(routeClarity(candidate, createConnectionPlan(candidate, "id", undefined, true)))
      .toMatchObject({ ...integrity, people: size, crossings: 0 });
  });

  it("uses a shared sibling rail instead of separate parallel lines for one family", () => {
    const candidate = directedFamilyCorridors(source(31).layout)!;
    const plan = createConnectionPlan(candidate, "id", undefined, false);
    const family = plan.families.find((family) => family.childIds.length === 3 && new Set(family.childPorts.map((port) => port.y)).size === 1)!;
    expect(family).toBeDefined();
    const railYs = family.childPorts.map((port) => {
      const stem = family.segments.find((segment) => segment.start.x === segment.end.x &&
        (segment.start.x === port.x && segment.start.y === port.y || segment.end.x === port.x && segment.end.y === port.y))!;
      expect(stem).toBeDefined();
      return stem.start.y === port.y ? stem.end.y : stem.start.y;
    });
    expect(new Set(railYs).size).toBe(1);
  });

  it.each(["en", "id"] as const)("keeps complete names, label attachments, and export paths in %s", (language) => {
    const { layout } = source(31);
    layout.people = layout.people.map((person) => ({ ...person, displayName: `Raden ${person.displayName} Kusumawardhana` }));
    const candidate = directedFamilyCorridors(layout)!;
    const plan = createConnectionPlan(candidate, language, undefined, false);
    expect(routeClarity(candidate, plan)).toMatchObject(integrity);
    expect(plan.nonParentRoutes.some((route) => route.labelTerminals?.length === 2)).toBe(true);
    const svg = new DOMParser().parseFromString(buildChartSvg(candidate, "Synthetic corridor study", undefined, language, plan).svg, "image/svg+xml");
    expect(svg.querySelectorAll("[data-person-id]")).toHaveLength(31);
    for (const family of plan.families) expect(svg.querySelector(`[data-family-id="${family.id}"]`)).not.toBeNull();
    for (const route of plan.nonParentRoutes) expect(svg.querySelector(`[data-route-id="${route.id}"]`)).not.toBeNull();
  });

  it("is deterministic across input order and leaves cyclic connections intact for the general renderer", () => {
    const { layout } = source(31), original = JSON.stringify(layout);
    const first = directedFamilyCorridors(layout)!;
    expect(first).not.toHaveProperty("bounds");
    expect(first.familyRailY).toBeUndefined();
    const reversed = directedFamilyCorridors({ ...layout, people: [...layout.people].reverse(), relationships: [...layout.relationships].reverse() })!;
    expect(new Map(reversed.people.map((person) => [person.id, { x: person.x, y: person.y }]))).toEqual(
      new Map(first.people.map((person) => [person.id, { x: person.x, y: person.y }])));
    expect(reversed.familyRouteGeometry).toEqual(first.familyRouteGeometry);
    expect(reversed.partnerRouteCandidates).toEqual(first.partnerRouteCandidates);
    const cyclic: TreeLayout = { ...layout, relationships: [...layout.relationships, {
      ...layout.relationships[0], id: "synthetic-cycle", kind: "partner", subtype: "spouse", fromPersonId: "synthetic-0004", toPersonId: "synthetic-0014"
    }] };
    const snapshot = JSON.stringify(cyclic);
    expect(directedFamilyCorridors(cyclic)).toBeUndefined();
    expect(JSON.stringify(cyclic)).toBe(snapshot);
    expect(JSON.stringify(layout)).toBe(original);
  });

  it("rejects corrupted labels at either partner, including a lower partner", () => {
    const candidate = directedFamilyCorridors(source(31).layout)!;
    const plan = createConnectionPlan(candidate, "id", undefined, false);
    const id = plan.nonParentRoutes.find((route) => route.labelTerminals?.length === 2)!.id;
    for (const index of [0, 1]) for (const corrupt of ["missing", "wrong-person", "free-point", "sideways", "upward"] as const) {
      const changed = structuredClone(plan), route = changed.nonParentRoutes.find((route) => route.id === id)!;
      const terminal = route.labelTerminals![index];
      if (corrupt === "missing") route.labelTerminals!.splice(index, 1);
      else if (corrupt === "wrong-person") terminal.personId = candidate.people.find((person) => ![route.relationship.fromPersonId, route.relationship.toPersonId].includes(person.id))!.id;
      else if (corrupt === "free-point") terminal.point.y += 1;
      else {
        const atStart = route.segments[0].start.x === terminal.point.x && route.segments[0].start.y === terminal.point.y;
        const point = corrupt === "sideways" ? { x: terminal.point.x + 40, y: terminal.point.y } : { x: terminal.point.x, y: terminal.point.y - 40 };
        if (atStart) route.segments[0].end = point; else route.segments.at(-1)!.start = point;
      }
      expect(routeClarity(candidate, changed).missingTerminals, `${index}: ${corrupt}`).toBeGreaterThan(0);
    }
  });

  it("rejects a parent port that reaches the wrong person or merely floats on a line", () => {
    const candidate = directedFamilyCorridors(source(31).layout)!;
    const plan = createConnectionPlan(candidate, "id", undefined, false);
    for (const corrupt of ["wrong-parent", "free-point", "upward"] as const) {
      const changed = structuredClone(plan), family = changed.families.find((family) => family.parentIds.length === 2)!;
      const port = family.parentPorts[0];
      if (corrupt === "wrong-parent") family.parentPorts.reverse();
      else if (corrupt === "free-point") port.y += 1;
      else {
        const segment = family.segments.find((segment) => segment.start.x === port.x && segment.start.y === port.y ||
          segment.end.x === port.x && segment.end.y === port.y)!;
        segment.start = { ...port }; segment.end = { x: port.x, y: port.y - 40 };
      }
      expect(routeClarity(candidate, changed).missingTerminals, corrupt).toBeGreaterThan(0);
    }
  });
});
