import { describe, expect, it, vi } from "vitest";
import * as corridors from "./unionCorridors";
import { createTreeLayout } from "./layout";
import { createConnectionPlan } from "./connectionPlan";
import { prepareTree } from "./treePreparation";
import { buildChartSvg } from "./chartExport";
import { routeClarity } from "./testFixtures/routeClarity";
import { indonesianFamilyFixture } from "./testFixtures/indonesianFamilies";
import { focusedFamily } from "./focusedFamily";
import type { FamilyRelationship, PositionedPerson } from "./types";

const integrity = { missingParentOrPartnerEdges: 0, missingTerminals: 0, disconnectedRoutes: 0,
  diagonalSegments: 0, obstacleHits: 0, personOverlaps: 0, reversedParentDirections: 0,
  conflatedParentSets: 0, unlabeledParentTypes: 0, unrelatedOverlaps: 0, failures: 0 };
const prepare = (data: ReturnType<typeof indonesianFamilyFixture>, language: "en" | "id" = "id", layoutMode: "full" | "focus" = "full") => prepareTree({ ...data,
  requestKey: "union-corridors", generationLimits: { ancestors: null, descendants: null },
  language, relationshipLanguage: language, controlsVisible: true, layoutMode });

describe("coordinated multiple-union corridors", () => {
  it("removes the nested union crossing without changing the family records", () => {
    const data = indonesianFamilyFixture(15, "multiple-wives"), saved = JSON.stringify(data);
    const bypass = vi.spyOn(corridors, "staggerUnionParents").mockImplementation(() => {});
    let baseline;
    // Isolate this compact-layout optimization, without Full's alternative
    // routing solving the deliberately disabled baseline by another method.
    try { baseline = prepare(data, "id", "focus"); } finally { bypass.mockRestore(); }
    const revised = prepare(data, "id", "focus");
    expect(routeClarity(baseline.geometryLayout, baseline.connectionPlan)).toMatchObject({ ...integrity, crossings: 1 });
    expect(routeClarity(revised.geometryLayout, revised.connectionPlan)).toMatchObject({ ...integrity, crossings: 0, people: 15 });
    expect(revised.connectionPlan.nonParentRoutes.filter((route) => route.labelTerminals?.length)).toHaveLength(1);
    const baselineGenerations = new Map(baseline.geometryLayout.people.map((person) => [person.id, person.generation]));
    for (const person of revised.geometryLayout.people) expect(person.generation).toBe(baselineGenerations.get(person.id));
    expect(JSON.stringify(data)).toBe(saved);
  });

  it.each(["en", "id"] as const)("keeps long labels, controls, Focus and image-export connections intact in %s", (language) => {
    const data = indonesianFamilyFixture(15, "multiple-wives");
    data.people = data.people.map((person) => ({ ...person, displayName: `Raden ${person.displayName} Kusumawardhana` }));
    const prepared = prepare(data, language);
    expect(routeClarity(prepared.geometryLayout, prepared.connectionPlan)).toMatchObject({ ...integrity, crossings: 0 });
    for (const personId of [data.rootId, "synthetic-0005"]) {
      const focus = focusedFamily(data.people, data.relationships, { personId, ancestors: 2, descendants: 1, siblings: true });
      const scene = prepare({ ...data, ...focus }, language);
      expect(routeClarity(scene.geometryLayout, scene.connectionPlan)).toMatchObject(integrity);
    }
    // SVG is also the source rasterized for PNG. Test its independently
    // prepared (unselected, shorter labels) plan as well as the worker plan.
    const directLayout = createTreeLayout(data.people, data.relationships);
    const directPlan = createConnectionPlan(directLayout, language, undefined, false);
    expect(routeClarity(directLayout, directPlan)).toMatchObject({ ...integrity, crossings: 0 });
    for (const [layout, plan] of [[prepared.geometryLayout, prepared.connectionPlan], [directLayout, directPlan]] as const) {
      const svg = new DOMParser().parseFromString(buildChartSvg(layout, "Synthetic unions", undefined, language, plan).svg, "image/svg+xml");
      expect(svg.querySelectorAll("[data-person-id]")).toHaveLength(data.people.length);
      for (const route of plan.nonParentRoutes) expect(svg.querySelector(`[data-route-id="${route.id}"]`)).not.toBeNull();
      for (const family of plan.families) expect(svg.querySelector(`[data-family-id="${family.id}"]`)).not.toBeNull();
    }
  });

  it("rejects invented, misattached, and incorrectly directed label terminals", () => {
    const { geometryLayout: layout, connectionPlan: plan } = prepare(indonesianFamilyFixture(15, "multiple-wives"));
    for (const corrupt of ["missing", "wrong-person", "free-point", "sideways", "upward"] as const) {
      const changed = structuredClone(plan);
      const route = changed.nonParentRoutes.find((entry) => entry.labelTerminals?.length)!;
      const terminal = route.labelTerminals![0];
      if (corrupt === "missing") route.labelTerminals = undefined;
      else if (corrupt === "wrong-person") terminal.personId = "synthetic-0009";
      else if (corrupt === "free-point") terminal.point.y += 1;
      else {
        const last = route.segments.at(-1)!;
        last.start = corrupt === "sideways" ? { x: last.end.x + 40, y: last.end.y } : { x: last.end.x, y: last.end.y - 40 };
      }
      expect(routeClarity(layout, changed).missingTerminals, corrupt).toBeGreaterThan(0);
    }
  });

  it("keeps an empty union visible without colliding with the two parent-set sockets", () => {
    const data = indonesianFamilyFixture(15, "multiple-wives");
    const omitted = new Set(["synthetic-0010", "synthetic-0011", "synthetic-0012"]);
    data.people = data.people.filter((person) => !omitted.has(person.id));
    data.relationships = data.relationships.filter((edge) => !omitted.has(edge.fromPersonId) && !omitted.has(edge.toPersonId));
    const scene = prepare(data);
    if (process.env.HERITG_UNION_DETAILS) console.info(JSON.stringify({ people: scene.geometryLayout.people.map(({ id, x, y }) => ({ id, x, y })), plan: scene.connectionPlan }));
    expect(routeClarity(scene.geometryLayout, scene.connectionPlan)).toMatchObject({ ...integrity, crossings: 0 });
    expect(scene.connectionPlan.nonParentRoutes.some((route) => route.relationship.toPersonId === "synthetic-0009")).toBe(true);
  });

  it("separates four unions with nested spouses on both sides of the shared parent", () => {
    const data = indonesianFamilyFixture(13, "multiple-wives");
    const wife = { ...data.people[1], id: "fourth-wife", displayName: "Nur Wulandari 14", birthDate: "1830-01-01", deathDate: "1910-01-01" };
    data.people.push(wife);
    data.relationships.push({ ...data.relationships[0], id: "fourth-union", toPersonId: wife.id, marriageDate: "1869-06-01" });
    for (let index = 0; index < 3; index++) {
      const child = { ...data.people[2], id: `fourth-child-${index}`, displayName: `Arif Wulandari ${15 + index}`, birthDate: `${1870 + index * 2}-01-01`, deathDate: `${1950 + index * 2}-01-01` };
      data.people.push(child);
      for (const id of [data.rootId, wife.id]) data.relationships.push({ ...data.relationships[1], id: `${id}:${child.id}`, fromPersonId: id, toPersonId: child.id });
    }
    const scene = prepare(data);
    expect(routeClarity(scene.geometryLayout, scene.connectionPlan)).toMatchObject({ ...integrity, crossings: 0, people: 17 });
    expect(scene.connectionPlan.nonParentRoutes).toHaveLength(4);
    const reversed = prepare({ ...data, people: [...data.people].reverse(), relationships: [...data.relationships].reverse() });
    expect(reversed).toEqual(scene);
  });

  it("does not stagger a spouse with connected ancestry, another union, or a care branch", () => {
    const seed = indonesianFamilyFixture(15, "multiple-wives");
    const original = createTreeLayout(seed.people, seed.relationships).people;
    const edge = (kind: FamilyRelationship["kind"], from: string, to: string, subtype: FamilyRelationship["subtype"]): FamilyRelationship => ({
      ...seed.relationships[0], id: "extra", kind, fromPersonId: from, toPersonId: to, subtype
    });
    for (const extra of [edge("parent", "synthetic-0001", "synthetic-0005", "biologicalParent"),
      edge("partner", "synthetic-0005", "synthetic-0013", "formerSpouse"),
      edge("parent", "synthetic-0005", "synthetic-0014", "guardian")]) {
      // Supply the un-staggered row to exercise eligibility, independent of
      // the complete layout's generation assignment for these extra edges.
      const people: PositionedPerson[] = original.map((person) => ({ ...person, y: person.generation * 500 }));
      const before = JSON.stringify(people);
      corridors.staggerUnionParents(people, [...seed.relationships, extra]);
      expect(JSON.stringify(people)).toBe(before);
    }
  });

  it.each([0, 2, 4])("keeps the 500-person multiple-wife worker chart crossing-free (seed %i)", (seed) => {
    const data = indonesianFamilyFixture(500, "multiple-wives", seed), before = JSON.stringify(data);
    const scene = prepare(data);
    expect(scene.connectionPlan.isValid).toBe(true);
    expect(routeClarity(scene.geometryLayout, scene.connectionPlan)).toMatchObject({ ...integrity, people: 500, crossings: 0 });
    expect(scene.connectionPlan.nonParentRoutes.some((route) => route.labelTerminals?.length)).toBe(true);
    expect(JSON.stringify(data)).toBe(before);
  }, 30000);
});
