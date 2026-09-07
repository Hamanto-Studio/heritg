import { describe, expect, it } from "vitest";
import { indonesianFamilyFixture } from "./testFixtures/indonesianFamilies";
import { createTreeLayout } from "./layout";
import { sharedAncestryCorridors } from "./sharedAncestryCorridors";
import { createConnectionPlan } from "./connectionPlan";
import { completeTreeRouting } from "./fullTreeRouting";
import { prepareTree } from "./treePreparation";
import { focusedFamily } from "./focusedFamily";
import { visibleConnectionPlan } from "./visibleConnectionPlan";
import { buildChartSvg } from "./chartExport";
import { routeClarity } from "./testFixtures/routeClarity";
import { pointOnSegment } from "./connectionGeometry";
import { parentConnectionGroups } from "./parentConnections";
import type { FamilyRelationship } from "./types";

const integrity = { missingParentOrPartnerEdges: 0, missingTerminals: 0, disconnectedRoutes: 0,
  diagonalSegments: 0, obstacleHits: 0, personOverlaps: 0, reversedParentDirections: 0,
  conflatedParentSets: 0, unlabeledParentTypes: 0, unrelatedOverlaps: 0, failures: 0 };
const reserved = (data: { people: ReturnType<typeof indonesianFamilyFixture>["people"]; relationships: FamilyRelationship[] }) => {
  const raw = createTreeLayout(data.people, data.relationships);
  return { ...raw, people: raw.people.map((person) => ({ ...person, role: " " })) };
};
const prepare = (data: Parameters<typeof reserved>[0], layoutMode: "full" | "focus" = "full") => prepareTree({ ...data,
  requestKey: "shared-parent-sets", generationLimits: { ancestors: null, descendants: null },
  language: "id", relationshipLanguage: "id", controlsVisible: false, layoutMode });

describe("shared birth, adoptive and foster families", () => {
  it.each([100, 250, 500])("keeps all %i people and recorded parent sets, including guardians, through Full preparation", (size) => {
    const data = indonesianFamilyFixture(size, "shared-parent-sets"), before = JSON.stringify(data);
    const result = prepare(data), metrics = routeClarity(result.geometryLayout, result.connectionPlan);
    expect(metrics).toMatchObject({ ...integrity, people: size, relationships: data.relationships.length });
    // Three parent sets sharing three siblings still have a crossing in this
    // drawing. Do not confuse that with a route cutting another household:
    // every residual crossing must belong to the same recorded child cohort,
    // and no such cohort may have more than one. This is not a global-minimum
    // claim for arbitrary graphs or a substitute for visual verification.
    const crossedCohorts = new Set<string>();
    for (const crossing of result.connectionPlan.crossings) {
      const owners = result.connectionPlan.families.filter((family) =>
        family.segments.some((segment) => pointOnSegment(crossing, segment)));
      expect(owners).toHaveLength(2);
      expect(owners.every((family) => !family.care)).toBe(true);
      expect(owners[0].childIds).toEqual(owners[1].childIds);
      const cohort = JSON.stringify(owners[0].childIds);
      expect(crossedCohorts.has(cohort)).toBe(false);
      crossedCohorts.add(cohort);
    }
    expect(metrics.crossings).toBeLessThanOrEqual(Math.floor(size / 9));
    expect(result.geometryLayout.relationships).toEqual(reserved(data).relationships);
    expect(routeClarity(result.geometryLayout, visibleConnectionPlan(result.connectionPlan, result.geometryLayout, "id")))
      .toMatchObject(integrity);
    expect(JSON.stringify(data)).toBe(before);
  }, 60000);

  it("keeps every label in the compact drawing and in a focused window", () => {
    const data = indonesianFamilyFixture(100, "shared-parent-sets"), raw = reserved(data);
    const plan = createConnectionPlan(raw, "id", undefined, false);
    expect(routeClarity(raw, plan)).toMatchObject(integrity);
    const anchor = data.people.find((person) => data.relationships.filter((edge) =>
      edge.toPersonId === person.id && edge.kind === "parent").length > 6)!;
    const focus = focusedFamily(data.people, data.relationships, { personId: anchor.id, ancestors: 1, descendants: 1 });
    const result = prepare(focus, "focus");
    expect(result.geometryLayout.familyRouteGeometry).toBeUndefined();
    expect(result.geometryLayout.people.length).toBeLessThan(20);
    expect(routeClarity(result.geometryLayout, result.connectionPlan)).toMatchObject(integrity);
  });

  it.each(["biologicalParent", "adoptiveParent", "fosterParent"] as const)(
    "keeps the attached %s set outside nested household joins regardless of IDs", (attachedType) => {
      const data = indonesianFamilyFixture(28, "shared-parent-sets");
      const types = ["biologicalParent", "adoptiveParent", "fosterParent"] as const;
      const offset = types.indexOf(attachedType);
      data.relationships = data.relationships.map((edge) => {
        const typeIndex = types.findIndex((type) => type === edge.subtype);
        return typeIndex < 0 ? edge : { ...edge, subtype: types[(typeIndex + offset) % types.length] };
      });
      const renamed = new Map(data.people.map((person, i) => [person.id, `person-${String(data.people.length - i).padStart(3, "0")}`]));
      data.people = data.people.map((person) => ({ ...person, id: renamed.get(person.id)! })).reverse();
      data.relationships = data.relationships.map((edge, i) => ({ ...edge, id: `record-${1000 - i}`,
        fromPersonId: renamed.get(edge.fromPersonId)!, toPersonId: renamed.get(edge.toPersonId)! })).reverse();
      const layout = reserved(data), before = JSON.stringify(layout), candidate = sharedAncestryCorridors(layout)!;
      expect(candidate).toBeDefined();
      const position = new Map(candidate.people.map((person) => [person.id, person]));
      const incoming = new Set(data.relationships.filter((edge) => edge.kind === "parent").map((edge) => edge.toPersonId));
      const groups = parentConnectionGroups(data.relationships).filter((group) => !group.care);
      for (const group of groups) {
        if (!group.parentIds.some((id) => incoming.has(id))) continue;
        const peers = groups.filter((other) => other !== group && JSON.stringify(other.childIds) === JSON.stringify(group.childIds));
        if (peers.length !== 2) continue;
        expect(Math.max(...group.parentIds.map((id) => position.get(id)!.x)))
          .toBeLessThan(Math.min(...peers.flatMap((other) => other.parentIds.map((id) => position.get(id)!.x))));
      }
      for (const language of ["en", "id"] as const) {
        const plan = createConnectionPlan(candidate, language, undefined, true);
        expect(completeTreeRouting(candidate, plan)).toBe(true);
        expect(routeClarity(candidate, plan)).toMatchObject(integrity);
        expect(plan.crossings.length).toBeLessThanOrEqual(3);
      }
      expect(JSON.stringify(layout)).toBe(before);
    });

  it.each([2, 3, 5])("keeps three disjoint parent sets and %i shared siblings labeled in both languages", (count) => {
    const template = indonesianFamilyFixture(10, "shared-parent-sets"), base = template.people[0];
    const parents = ["birth-a", "birth-b", "adopt-a", "adopt-b", "foster-a"];
    const children = Array.from({ length: count }, (_, i) => `child-${i}`);
    const data = { people: [...parents, ...children].map((id, index) => ({ ...base, id, displayName: `Synthetic ${id}`,
      birthDate: index < parents.length ? "1980-01-01" : `${2005 + index - parents.length}-01-01`, deathDate: undefined })),
      relationships: children.flatMap((child) => parents.map((parent, index): FamilyRelationship => ({ ...template.relationships[0],
        id: `${parent}:${child}`, fromPersonId: parent, toPersonId: child, kind: "parent",
        subtype: index < 2 ? "biologicalParent" : index < 4 ? "adoptiveParent" : "fosterParent" }))) };
    const layout = reserved(data), before = JSON.stringify(layout), candidate = sharedAncestryCorridors(layout)!;
    expect(candidate).toBeDefined();
    const reverse = sharedAncestryCorridors({ ...layout, people: [...layout.people].reverse(), relationships: [...layout.relationships].reverse() })!;
    expect(new Map(reverse.people.map((person) => [person.id, [person.x, person.y]])))
      .toEqual(new Map(candidate.people.map((person) => [person.id, [person.x, person.y]])));
    for (const language of ["en", "id"] as const) {
      const plan = createConnectionPlan(candidate, language, undefined, false);
      expect(completeTreeRouting(candidate, plan)).toBe(true);
      expect(routeClarity(candidate, plan)).toMatchObject(integrity);
      expect(plan.families.flatMap((family) => family.childLabels ?? [])).toHaveLength(count * 3);
      const svg = buildChartSvg(candidate, "Synthetic parent sets", undefined, language, plan).svg;
      for (const name of language === "en" ? ["Biological parents", "Adoptive parents", "Foster parent"] :
        ["Orang tua kandung", "Orang tua angkat", "Orang tua asuh"]) expect(svg).toContain(name);
      for (const person of data.people) expect(svg).toContain(person.displayName);
    }
    expect(JSON.stringify(layout)).toBe(before);
  });

  it.each(["guardian", "stepParent"] as const)("does not place an isolated %s inside an existing parent set", (subtype) => {
    const data = indonesianFamilyFixture(19, "shared-parent-sets"), layout = reserved(data);
    layout.relationships = layout.relationships.map((edge) => edge.subtype === "guardian" ? { ...edge, subtype } : edge);
    const candidate = sharedAncestryCorridors(layout)!;
    const plan = createConnectionPlan(candidate, "id", undefined, false);
    expect(routeClarity(candidate, plan)).toMatchObject(integrity);
    for (const family of plan.families.filter((family) => family.care)) {
      expect(family.parentIds).toHaveLength(1);
      expect(family.label?.text).toBe(subtype === "guardian" ? "Wali" : "Orang tua tiri");
      const guardian = family.parentIds[0];
      expect(plan.families.filter((other) => !other.care).some((other) => other.parentIds.includes(guardian))).toBe(false);
    }
  });
});
