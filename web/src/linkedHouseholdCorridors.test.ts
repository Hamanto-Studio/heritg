import { describe, expect, it } from "vitest";
import { linkedHouseholdCorridors } from "./linkedHouseholdCorridors";
import { prepareTree } from "./treePreparation";
import { createTreeLayout } from "./layout";
import { createConnectionPlan } from "./connectionPlan";
import { completeTreeRouting } from "./fullTreeRouting";
import { visibleConnectionPlan } from "./visibleConnectionPlan";
import { buildChartSvg } from "./chartExport";
import { indonesianFamilyFixture } from "./testFixtures/indonesianFamilies";
import { routeClarity } from "./testFixtures/routeClarity";
import type { PositionedPerson } from "./types";

const clear = { missingParentOrPartnerEdges: 0, missingTerminals: 0, disconnectedRoutes: 0, diagonalSegments: 0,
  obstacleHits: 0, personOverlaps: 0, reversedParentDirections: 0, conflatedParentSets: 0, unlabeledParentTypes: 0,
  unrelatedOverlaps: 0, crossings: 0, failures: 0 };
const prepare = (data: ReturnType<typeof indonesianFamilyFixture>, layoutMode: "full" | "focus" = "full") =>
  prepareTree({ ...data, requestKey: "linked-households", generationLimits: { ancestors: null, descendants: null },
    language: "id", relationshipLanguage: "id", controlsVisible: false, layoutMode });
const reserved = (data: ReturnType<typeof indonesianFamilyFixture>) => {
  const layout = createTreeLayout(data.people, data.relationships);
  return { ...layout, people: layout.people.map((person) => ({ ...person, role: " " })) };
};

describe("linked origin-family corridors", () => {
  it.each([100, 250, 500])("draws every person and relationship without crossings in the %i-person live Full result", (size) => {
    const data = indonesianFamilyFixture(size, "linked-households"), before = JSON.stringify(data);
    const result = prepare(data);
    expect(result.geometryLayout.familyRouteGeometry).toBeDefined();
    expect(routeClarity(result.geometryLayout, result.connectionPlan)).toMatchObject({ ...clear,
      people: size, relationships: data.relationships.length });
    expect(result.geometryLayout.people.map((person) => person.id).sort()).toEqual(data.people.map((person) => person.id).sort());
    expect(result.geometryLayout.relationships).toEqual(createTreeLayout(data.people, data.relationships).relationships);
    expect(routeClarity(result.geometryLayout, visibleConnectionPlan(result.connectionPlan, result.geometryLayout, "id")))
      .toMatchObject(clear);
    expect(JSON.stringify(data)).toBe(before);
  }, 30000);

  it("does not change the family graph, dates, or logical generations when giving spouses' origin families separate space", () => {
    const data = indonesianFamilyFixture(100, "linked-households"), layout = reserved(data), before = JSON.stringify(layout);
    const candidate = linkedHouseholdCorridors(layout)!;
    expect(candidate).toBeDefined();
    const withoutPosition = ({ x, y, ...person }: PositionedPerson) => { void x; void y; return person; };
    expect(candidate.people.map(withoutPosition)).toEqual(layout.people.map(withoutPosition));
    expect(candidate.relationships).toBe(layout.relationships);
    expect(JSON.stringify(layout)).toBe(before);
    const focused = prepare(data, "focus");
    expect(focused.geometryLayout.familyRouteGeometry).toBeUndefined();
    expect(focused.geometryLayout).toEqual(createTreeLayout(data.people, data.relationships));
  });

  it("is deterministic with shuffled records and remains clear when identifiers and names change", () => {
    const data = indonesianFamilyFixture(100, "linked-households", 3);
    const layout = reserved(data), expected = linkedHouseholdCorridors(layout)!;
    const shuffled = linkedHouseholdCorridors({ ...layout, people: [...layout.people].reverse(), relationships: [...layout.relationships].reverse() })!;
    expect([...shuffled.people].sort((a, b) => a.id.localeCompare(b.id))).toEqual([...expected.people].sort((a, b) => a.id.localeCompare(b.id)));
    expect(shuffled.familyRouteGeometry).toEqual(expected.familyRouteGeometry);
    const renamed = new Map(data.people.map((person, i) => [person.id, `person-${String(data.people.length - i).padStart(4, "0")}`]));
    const alternative = { ...data, people: data.people.map((person) => ({ ...person, id: renamed.get(person.id)! })),
      relationships: data.relationships.map((edge, i) => ({ ...edge, id: `record-${data.relationships.length - i}`,
        fromPersonId: renamed.get(edge.fromPersonId)!, toPersonId: renamed.get(edge.toPersonId)! })) };
    const candidate = linkedHouseholdCorridors(reserved(alternative))!;
    expect(candidate).toBeDefined();
    expect(routeClarity(candidate, createConnectionPlan(candidate, "id", undefined, true))).toMatchObject(clear);
  });

  it.each(["en", "id"] as const)("keeps selected/unselected endpoints and SVG exports correct in %s", (language) => {
    const data = indonesianFamilyFixture(31, "linked-households"), candidate = linkedHouseholdCorridors(reserved(data))!;
    const plan = createConnectionPlan(candidate, language, undefined, true);
    expect(completeTreeRouting(candidate, plan)).toBe(true);
    for (const selected of [undefined, candidate.people[0].id, candidate.people.at(-1)!.id]) {
      const visible = { ...candidate, people: candidate.people.map((person) => ({ ...person, role: selected ? "Family member" : "" })) };
      expect(routeClarity(visible, visibleConnectionPlan(plan, visible, language))).toMatchObject(clear);
      const svg = buildChartSvg(visible, "Synthetic linked families", selected, language, plan).svg;
      for (const person of data.people) expect(svg).toContain(person.displayName);
      expect(svg).toContain(language === "id" ? "Nikah" : "Married");
    }
  });

  it("retains childless partners and isolated people without duplicate placements", () => {
    const data = indonesianFamilyFixture(100, "linked-households");
    data.people.push({ ...data.people[0], id: "isolated-a" }, { ...data.people[0], id: "isolated-b" });
    const layout = reserved(data), candidate = linkedHouseholdCorridors(layout)!;
    const shuffled = linkedHouseholdCorridors({ ...layout, people: [...layout.people].reverse() })!;
    expect(new Set(candidate.people.map((person) => person.id)).size).toBe(data.people.length);
    expect(candidate.relationships).toBe(layout.relationships);
    expect(shuffled.familyRouteGeometry).toEqual(candidate.familyRouteGeometry);
    expect(routeClarity(candidate, createConnectionPlan(candidate, "id", undefined, false))).toMatchObject(clear);
  });

  it("declines partial ancestry merges and extra care without ever returning a partial drawing", () => {
    const layout = reserved(indonesianFamilyFixture(15, "linked-households"));
    layout.relationships.push({ ...layout.relationships[0], id: "additional-parent-set", kind: "parent", subtype: "adoptiveParent",
      fromPersonId: layout.people[0].id, toPersonId: layout.people.at(-1)!.id });
    const before = JSON.stringify(layout);
    expect(linkedHouseholdCorridors(layout)).toBeUndefined();
    expect(JSON.stringify(layout)).toBe(before);
  });
});
