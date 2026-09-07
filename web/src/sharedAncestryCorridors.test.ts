import { describe, expect, it } from "vitest";
import { sharedAncestryCorridors } from "./sharedAncestryCorridors";
import { createTreeLayout } from "./layout";
import { createConnectionPlan } from "./connectionPlan";
import { completeTreeRouting, fullTreeRouting } from "./fullTreeRouting";
import { prepareTree } from "./treePreparation";
import { buildChartSvg } from "./chartExport";
import { visibleConnectionPlan } from "./visibleConnectionPlan";
import { indonesianFamilyFixture } from "./testFixtures/indonesianFamilies";
import { routeClarity } from "./testFixtures/routeClarity";
import type { FamilyRelationship } from "./types";

const integrity = { missingParentOrPartnerEdges: 0, missingTerminals: 0, disconnectedRoutes: 0,
  diagonalSegments: 0, obstacleHits: 0, personOverlaps: 0, reversedParentDirections: 0,
  conflatedParentSets: 0, unlabeledParentTypes: 0, unrelatedOverlaps: 0, failures: 0 };
const reserved = (data: ReturnType<typeof indonesianFamilyFixture>) => {
  const layout = createTreeLayout(data.people, data.relationships);
  return { ...layout, people: layout.people.map((person) => ({ ...person, role: " " })) };
};
const prepare = (data: ReturnType<typeof indonesianFamilyFixture>, layoutMode: "full" | "focus" = "full") =>
  prepareTree({ ...data, requestKey: "shared-parent-sets", generationLimits: { ancestors: null, descendants: null },
    language: "id", relationshipLanguage: "id", controlsVisible: false, layoutMode });

describe("complete households between independent ancestry rails", () => {
  it.each([100, 250, 500])("keeps all %i people and recorded relationships clear through the live Full entry", (size) => {
    const data = indonesianFamilyFixture(size, "shared-adoption"), before = JSON.stringify(data);
    const result = prepare(data);
    expect(result.geometryLayout.familyRouteGeometry).toBeDefined();
    expect(routeClarity(result.geometryLayout, result.connectionPlan)).toMatchObject({ ...integrity,
      people: size, relationships: data.relationships.length, crossings: 0 });
    expect(result.geometryLayout.people.map((person) => person.id).sort()).toEqual(data.people.map((person) => person.id).sort());
    expect(result.geometryLayout.relationships).toEqual(createTreeLayout(data.people, data.relationships).relationships);
    expect(routeClarity(result.geometryLayout, visibleConnectionPlan(result.connectionPlan, result.geometryLayout, "id")))
      .toMatchObject({ ...integrity, crossings: 0 });
    expect(JSON.stringify(data)).toBe(before);
  }, 30000);

  it("keeps Focus compact but reserves enough room to label every birth/adoptive connection", () => {
    const data = indonesianFamilyFixture(100, "shared-adoption"), result = prepare(data, "focus");
    expect(result.geometryLayout.familyRouteGeometry).toBeUndefined();
    expect(routeClarity(result.geometryLayout, result.connectionPlan)).toMatchObject(integrity);
    // This regression measures the remaining compact drawing, not a Full
    // readiness claim. Full uses the zero-crossing whole-household alternative.
    expect(result.connectionPlan.crossings).toHaveLength(32);
  });

  it("repairs an invalid incumbent even when its reported crossing count is zero", () => {
    const layout = reserved(indonesianFamilyFixture(15, "shared-adoption"));
    const plan = createConnectionPlan(layout, "id", undefined, false);
    const invalid = { ...plan, crossings: [], isValid: false, failures: ["missing-parent-type-label"] };
    const result = fullTreeRouting(layout, invalid, "id", false);
    expect(result.plan).not.toBe(invalid);
    expect(completeTreeRouting(result.layout, result.plan)).toBe(true);
    expect(routeClarity(result.layout, result.plan)).toMatchObject({ ...integrity, crossings: 0 });
  });

  it.each(["adoptiveParent", "fosterParent"] as const)("keeps separate %s and biological labels across 2, 4 and 8 shared siblings", (subtype) => {
    for (const count of [2, 4, 8]) {
      const template = indonesianFamilyFixture(15, "shared-adoption"), seed = template.people[0];
      const parents = ["birth-a", "birth-b", "care-a", "care-b"], children = Array.from({ length: count }, (_, i) => `child-${i}`);
      const people = [...parents, ...children].map((id, index) => ({ ...seed, id, displayName: id,
        birthDate: index < parents.length ? "1980-01-01" : `${2005 + index - parents.length}-01-01`, deathDate: undefined }));
      const relationships: FamilyRelationship[] = children.flatMap((child) => parents.map((parent, index) => ({
        ...template.relationships[0], id: `${parent}:${child}`, fromPersonId: parent, toPersonId: child,
        kind: "parent", subtype: index < 2 ? "biologicalParent" : subtype
      })));
      const data = { ...template, people, relationships };
      const layout = reserved(data), candidate = sharedAncestryCorridors(layout)!;
      expect(candidate).toBeDefined();
      for (const language of ["en", "id"] as const) {
        const plan = createConnectionPlan(candidate, language, undefined, true);
        expect(completeTreeRouting(candidate, plan)).toBe(true);
        expect(routeClarity(candidate, plan)).toMatchObject({ ...integrity, crossings: 0 });
        expect(plan.families.flatMap((family) => family.childLabels ?? [])).toHaveLength(count * 2);
        const svg = buildChartSvg(candidate, "Synthetic parent sets", undefined, language, plan).svg;
        expect(svg).toContain(language === "id" ? "Orang tua kandung" : "Biological parents");
        expect(svg).toContain(language === "id" ? subtype === "adoptiveParent" ? "Orang tua angkat" : "Orang tua asuh"
          : subtype === "adoptiveParent" ? "Adoptive parents" : "Foster parents");
      }
    }
  });

  it("is input-order independent and retains isolated people and childless partnerships", () => {
    const data = indonesianFamilyFixture(100, "shared-adoption");
    data.people.push({ ...data.people[0], id: "isolated", displayName: "Isolated synthetic person" });
    const layout = reserved(data), before = JSON.stringify(layout);
    const candidate = sharedAncestryCorridors(layout)!;
    const reversed = sharedAncestryCorridors({ ...layout, people: [...layout.people].reverse(), relationships: [...layout.relationships].reverse() })!;
    const positions = (value: typeof candidate) => [...value.people].sort((a, b) => a.id.localeCompare(b.id));
    expect(positions(reversed)).toEqual(positions(candidate));
    expect(reversed.familyRouteGeometry).toEqual(candidate.familyRouteGeometry);
    expect(candidate.people).toHaveLength(data.people.length);
    expect(candidate.relationships).toEqual(layout.relationships);
    expect(JSON.stringify(layout)).toBe(before);
  });

  it("declines unsupported intermarrying households and care loops without dropping their records", () => {
    const linked = reserved(indonesianFamilyFixture(100, "linked-households"));
    expect(sharedAncestryCorridors(linked)).toBeUndefined();
    const layout = reserved(indonesianFamilyFixture(15, "shared-adoption"));
    layout.relationships.push({ ...layout.relationships[0], id: "extra-care", fromPersonId: layout.people[0].id,
      toPersonId: layout.people.at(-1)!.id, kind: "parent", subtype: "guardian" });
    const before = JSON.stringify(layout);
    expect(sharedAncestryCorridors(layout)).toBeUndefined();
    expect(JSON.stringify(layout)).toBe(before);
  });
});
