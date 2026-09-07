import { describe, expect, it } from "vitest";
import { prepareTree } from "./treePreparation";
import { fullTreeRouting, completeTreeRouting } from "./fullTreeRouting";
import { createTreeLayout } from "./layout";
import { createConnectionPlan } from "./connectionPlan";
import { routeClarity } from "./testFixtures/routeClarity";
import { indonesianFamilyFixture, indonesianScenarios } from "./testFixtures/indonesianFamilies";
import { visibleConnectionPlan } from "./visibleConnectionPlan";

const integrity = { missingParentOrPartnerEdges: 0, missingTerminals: 0, disconnectedRoutes: 0,
  diagonalSegments: 0, obstacleHits: 0, personOverlaps: 0, reversedParentDirections: 0,
  conflatedParentSets: 0, unlabeledParentTypes: 0, unrelatedOverlaps: 0, failures: 0, crossings: 0 };
const prepare = (data: ReturnType<typeof indonesianFamilyFixture>, mode: "full" | "focus" = "full") => prepareTree({ ...data,
  requestKey: "full-tree-integration", generationLimits: { ancestors: null, descendants: null },
  language: "id", relationshipLanguage: "id", controlsVisible: false, layoutMode: mode });

describe("Full-tree routing integration", () => {
  it.each([0, 2, 4])("prepares zero-crossing 500-person compound trees through the live worker entry for seed %i", (seed) => {
    const data = indonesianFamilyFixture(500, "compound", seed), before = JSON.stringify(data);
    const started = performance.now(), result = prepare(data);
    console.info(JSON.stringify({ seed, fullPreparationMs: Math.round(performance.now() - started), crossings: result.connectionPlan.crossings.length }));
    expect(result.geometryLayout.familyRouteGeometry).toBeDefined();
    expect(routeClarity(result.geometryLayout, result.connectionPlan)).toMatchObject({ ...integrity, people: 500, relationships: data.relationships.length });
    const visible = visibleConnectionPlan(result.connectionPlan, result.geometryLayout, "id");
    expect(routeClarity(result.geometryLayout, visible)).toMatchObject(integrity);
    expect(result.geometryLayout.people.map((person) => person.role).every((role) => role === "")).toBe(true);
    expect(JSON.stringify(data)).toBe(before);
  }, 30000);

  it.each(indonesianScenarios)("keeps every person and relationship clear for the configured %s combination", (scenario) => {
    const size = Number(process.env.HERITG_STRESS_SIZE ?? 100), seed = Number(process.env.HERITG_STRESS_SEED ?? 0);
    const data = indonesianFamilyFixture(size, scenario, seed);
    const result = prepare(data);
    const measured = routeClarity(result.geometryLayout, result.connectionPlan);
    console.info(JSON.stringify({ scenario, seed, ...measured }));
    expect(measured).toMatchObject({ ...integrity, people: size, relationships: data.relationships.length });
    if (scenario !== "compound") expect(result.geometryLayout.familyRouteGeometry).toBeUndefined();
  }, 30000);

  it("retains compact Focus geometry and deterministic Full coordinates", () => {
    const data = indonesianFamilyFixture(31, "compound");
    const focus = prepare(data, "focus"), full = prepare(data);
    expect(focus.geometryLayout).toEqual(createTreeLayout(data.people, data.relationships));
    expect(full.geometryLayout.familyRouteGeometry).toBeDefined();
    expect(prepare({ ...data, people: [...data.people].reverse(), relationships: [...data.relationships].reverse() }).geometryLayout).toEqual(full.geometryLayout);
    expect(full.geometryLayout.relationships).toEqual(focus.geometryLayout.relationships);
  });

  it("preserves every edge while untangling a longer cyclic union", () => {
    const data = indonesianFamilyFixture(31, "compound");
    data.relationships.push({ ...data.relationships[0], id: "cyclic-union", kind: "partner", subtype: "spouse",
      fromPersonId: "synthetic-0004", toPersonId: "synthetic-0014" });
    const before = JSON.stringify(data), result = prepare(data), baseline = prepare(data, "focus");
    expect(result.connectionPlan.crossings.length).toBeLessThan(baseline.connectionPlan.crossings.length);
    expect(routeClarity(result.geometryLayout, result.connectionPlan)).toMatchObject(integrity);
    expect(result.geometryLayout.relationships).toEqual(baseline.geometryLayout.relationships);
    expect(result.geometryLayout.relationships.some((edge) => edge.id === "cyclic-union")).toBe(true);
    expect(JSON.stringify(data)).toBe(before);
  });

  it("does not replace a drawing already free of crossings", () => {
    const data = indonesianFamilyFixture(31, "extended");
    const layout = createTreeLayout(data.people, data.relationships);
    const plan = createConnectionPlan(layout, "id", undefined, false);
    expect(plan.crossings).toHaveLength(0);
    expect(fullTreeRouting(layout, plan, "id", false)).toEqual({ layout, plan });
  });

  it("rejects partial, disconnected, nonfinite, overlapped and misbound candidates even when the plan claims to be valid", () => {
    const { geometryLayout: raw, connectionPlan: plan } = prepare(indonesianFamilyFixture(31, "compound"));
    const layout = { ...raw, people: raw.people.map((person) => ({ ...person, role: " " })) };
    expect(completeTreeRouting(layout, plan)).toBe(true);
    for (const defect of ["missing", "floating", "disconnect", "nonfinite", "overlap"] as const) {
      const changed = structuredClone(plan);
      if (defect === "missing") changed.families.pop();
      if (defect === "floating") changed.families[0].parentPorts[0].y -= 2;
      if (defect === "disconnect") changed.families[0].segments.pop();
      if (defect === "nonfinite") changed.families[0].segments[0].start.x = Number.NaN;
      if (defect === "overlap") changed.families[1].segments.push(structuredClone(changed.families[0].segments[0]));
      expect(completeTreeRouting(layout, changed), defect).toBe(false);
    }
  });

  it("rejects missing parent-type/care labels and mismatched records even in a connected candidate", () => {
    const { geometryLayout: raw, connectionPlan: plan } = prepare(indonesianFamilyFixture(100, "interwoven"));
    const layout = { ...raw, people: raw.people.map((person) => ({ ...person, role: " " })) };
    expect(completeTreeRouting(layout, plan)).toBe(true);
    for (const defect of ["parent-label", "care-label", "wrong-record", "wrong-type-label"] as const) {
      const changed = structuredClone(plan);
      if (defect === "care-label") changed.families.find((family) => family.care)!.label = undefined;
      else {
        const family = changed.families.find((family) => family.childLabels?.length)!;
        if (defect === "parent-label") family.childLabels = undefined;
        if (defect === "wrong-record") family.relationshipIds[0] = "not-an-archive-record";
        if (defect === "wrong-type-label") family.childLabels![0].relationshipIds = [];
      }
      expect(completeTreeRouting(layout, changed), defect).toBe(false);
    }
  });

  it("independently rejects off-circle marriage endpoints even when they touch an avatar's bounding square", () => {
    const { geometryLayout: layout, connectionPlan: plan } = prepare(indonesianFamilyFixture(31, "extended"));
    const changed = structuredClone(plan), route = changed.nonParentRoutes.find((route) => route.relationship.kind === "partner")!;
    const from = layout.people.find((person) => person.id === route.relationship.fromPersonId)!;
    const to = layout.people.find((person) => person.id === route.relationship.toPersonId)!;
    route.labelTerminals = undefined;
    route.segments = [{ start: { x: from.x + 32, y: from.y + 12 }, end: { x: to.x - 32, y: to.y + 12 } }];
    expect(changed.isValid).toBe(true);
    expect(routeClarity(layout, changed).missingTerminals).toBe(2);
    expect(completeTreeRouting(layout, changed)).toBe(false);
  });
});
