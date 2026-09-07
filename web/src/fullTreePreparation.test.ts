import { afterEach, describe, expect, it, vi } from "vitest";
import { createTreeLayout } from "./layout";
import * as routing from "./connectionPlan";
import * as shared from "./sharedAncestryCorridors";
import { completeTreeRouting, fullTreeRouting } from "./fullTreeRouting";
import { prepareTree } from "./treePreparation";
import { indonesianFamilyFixture } from "./testFixtures/indonesianFamilies";
import { routeClarity } from "./testFixtures/routeClarity";

const reserved = (data: ReturnType<typeof indonesianFamilyFixture>) => {
  const layout = createTreeLayout(data.people, data.relationships);
  return { ...layout, people: layout.people.map((person) => ({ ...person, role: " " })) };
};
const request = (data: ReturnType<typeof indonesianFamilyFixture>) => ({ ...data, requestKey: "preparation-fast-path",
  generationLimits: { ancestors: null, descendants: null }, language: "id" as const,
  relationshipLanguage: "id" as const, controlsVisible: false });

afterEach(() => vi.restoreAllMocks());

describe("large Full-tree preparation without a discarded crowded plan", () => {
  it.each(["shared-adoption", "linked-households"] as const)("keeps identical 500-person %s geometry and routes while skipping the incumbent", (scenario) => {
    const data = indonesianFamilyFixture(500, scenario), before = JSON.stringify(data);
    const layout = reserved(data), started = performance.now();
    const legacy = fullTreeRouting(layout, routing.createConnectionPlan(layout, "id", undefined, false), "id", false);
    const legacyMs = performance.now() - started;
    const fallback = vi.fn(() => { throw new Error("A complete zero-crossing candidate needs no incumbent"); });
    const fastStart = performance.now(), fast = fullTreeRouting(layout, fallback, "id", false);
    const fastMs = performance.now() - fastStart;
    expect(fallback).not.toHaveBeenCalled();
    expect(fast).toEqual(legacy);
    expect(completeTreeRouting(fast.layout, fast.plan)).toBe(true);
    expect(routeClarity(fast.layout, fast.plan)).toMatchObject({ people: 500, relationships: data.relationships.length,
      crossings: 0, missingParentOrPartnerEdges: 0, missingTerminals: 0, disconnectedRoutes: 0, diagonalSegments: 0,
      obstacleHits: 0, personOverlaps: 0, reversedParentDirections: 0, conflatedParentSets: 0,
      unlabeledParentTypes: 0, unlabeledCareLabels: 0, unrelatedOverlaps: 0, failures: 0 });
    const integrated = prepareTree(request(data));
    expect(integrated.connectionPlan).toEqual(legacy.plan);
    expect(integrated.geometryLayout.people.map(({ id, x, y }) => ({ id, x, y })))
      .toEqual(legacy.layout.people.map(({ id, x, y }) => ({ id, x, y })));
    expect(integrated.geometryLayout.people.every((person) => person.role === "")).toBe(true);
    expect(JSON.stringify(data)).toBe(before);
    // Report local timing, not a hardware-sensitive performance assertion.
    console.info(JSON.stringify({ scenario, people: 500, legacyRoutingMs: Math.round(legacyMs), fastRoutingMs: Math.round(fastMs) }));
  }, 30000);

  it("compares a crossed candidate with the incumbent without routing that candidate twice", () => {
    const layout = reserved(indonesianFamilyFixture(100, "shared-parent-sets"));
    const build = vi.spyOn(shared, "sharedAncestryCorridors");
    const fallback = vi.fn(() => routing.createConnectionPlan(layout, "id", undefined, false));
    const result = fullTreeRouting(layout, fallback, "id", false);
    expect(fallback).toHaveBeenCalledOnce();
    expect(build).toHaveBeenCalledOnce();
    expect(result.plan.crossings.length).toBeGreaterThan(0);
    expect(completeTreeRouting(result.layout, result.plan)).toBe(true);
  });

  it.each(["missing-record", "wrong-terminal", "missing-type-label"] as const)("rejects a zero-crossing candidate with %s even if marked valid", (defect) => {
    const layout = reserved(indonesianFamilyFixture(100, "shared-adoption"));
    const create = routing.createConnectionPlan;
    vi.spyOn(routing, "createConnectionPlan").mockImplementationOnce((...args) => {
      const candidate = create(...args);
      expect(candidate.crossings).toHaveLength(0);
      if (defect === "missing-record") candidate.families.pop();
      if (defect === "wrong-terminal") candidate.families[0].parentPorts[0].y -= 2;
      if (defect === "missing-type-label") candidate.families.find((family) => family.childLabels?.length)!.childLabels = [];
      return candidate;
    });
    const fallback = vi.fn(() => create(layout, "id", undefined, false));
    fullTreeRouting(layout, fallback, "id", false);
    expect(fallback).toHaveBeenCalledOnce();
  });

  it("keeps small charts and Focus on their established preparation path", () => {
    const small = reserved(indonesianFamilyFixture(15, "shared-adoption"));
    const fallback = vi.fn(() => routing.createConnectionPlan(small, "id", undefined, false));
    fullTreeRouting(small, fallback, "id", false);
    expect(fallback).toHaveBeenCalledOnce();
    const data = indonesianFamilyFixture(100, "shared-adoption"), args = request(data);
    const focus = prepareTree({ ...args, layoutMode: "focus" });
    expect(focus.geometryLayout).toEqual(createTreeLayout(data.people, data.relationships));
    expect(focus.connectionPlan).toEqual(routing.createConnectionPlan(reserved(data), "id", undefined, false));
  });

  it.each(["extended", "parent-sets"] as const)("retains a clear ordinary 100-person %s tree without introducing household corridors", (scenario) => {
    const layout = reserved(indonesianFamilyFixture(100, scenario));
    const plan = routing.createConnectionPlan(layout, "id", undefined, false);
    const fallback = vi.fn(() => plan);
    expect(fullTreeRouting(layout, fallback, "id", false)).toEqual({ layout, plan });
    expect(fallback).toHaveBeenCalledOnce();
  });
});
